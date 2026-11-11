import type { RequestContext } from './context.js';
import { messageCampaignDelivery } from './message-campaign-delivery.js';
import {
  fingerprintMessageRequest,
  validateMessageTemplate,
} from './messages.js';
import type {
  MessageCampaignCreate,
  MessageRecipientFilter,
} from './messages.js';

export type MessageCampaignSendErrorCode =
  | 'invalid-template'
  | 'too-many-attachments'
  | 'attachment-unavailable'
  | 'attachment-too-large'
  | 'no-recipients'
  | 'idempotency-conflict'
  | 'event-not-found'
  | 'storage-unavailable'
  | 'verification-unavailable';

export type MessagePreviewErrorCode =
  'event-not-found' | 'no-recipients' | 'invalid-template';
export type MessagePreviewResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: MessagePreviewErrorCode;
        message: string;
        details?: string[];
      };
    };

export interface MessageCampaignData {
  campaign: {
    id: string;
    eventId: string;
    subject: string;
    status: string;
    createdAt: Date;
  };
  recipients: readonly {
    id: string;
    entryId: string | null;
    email: string;
    subject: string;
    status: string;
  }[];
}

export type MessageCampaignSendResult<Campaign = unknown> =
  | { ok: true; campaign: Campaign; replayed?: boolean }
  | {
      ok: false;
      error: {
        code: MessageCampaignSendErrorCode;
        message: string;
        details?: string[];
      };
    };

export interface MessageCampaignRecipient {
  readonly entryId: string | null;
  readonly registrationGroupId: string | null;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly eventName: string;
  readonly className: string;
  readonly entryNumber: string;
}

export interface MessageCampaignTransaction<Campaign, CampaignRecipient> {
  resolveRecipients(
    eventId: string,
    filter: MessageRecipientFilter,
  ): Promise<readonly MessageCampaignRecipient[] | null>;
  findByIdempotencyKey(key: string): Promise<{
    requestHash: string;
    campaign: Campaign;
    recipients: readonly CampaignRecipient[];
  } | null>;
  createCampaign(input: {
    eventId: string;
    idempotencyKey: string;
    requestHash: string;
    subject: string;
    text: string;
    actor: string;
  }): Promise<Campaign | null>;
  recordAudit(campaign: Campaign, actor: string, action: string): Promise<void>;
  enqueueVerificationRecipient(input: {
    campaign: Campaign;
    eventId: string;
    recipient: MessageCampaignRecipient;
    locale: string;
    correlationId: string;
  }): Promise<CampaignRecipient>;
  getLocale(): Promise<string>;
  enqueueRecipient(input: {
    campaign: Campaign;
    eventId: string;
    recipient: MessageCampaignRecipient;
    subject: string;
    text: string;
    locale: string;
    attachmentRefs: readonly { objectId: string; filename: string }[];
    correlationId: string;
  }): Promise<CampaignRecipient>;
  markSending(campaign: Campaign): Promise<Campaign>;
  listRecipients(campaign: Campaign): Promise<readonly CampaignRecipient[]>;
}

export interface MessageCampaignDeliveryStrategy<Campaign, CampaignRecipient> {
  readonly auditAction: string;
  validateRecipients(recipients: readonly MessageCampaignRecipient[]):
    | { ok: true }
    | {
        ok: false;
        error: { code: MessageCampaignSendErrorCode; message: string };
      };
  enqueue(
    transaction: MessageCampaignTransaction<Campaign, CampaignRecipient>,
    input: {
      campaign: Campaign;
      eventId: string;
      recipient: MessageCampaignRecipient;
      locale: string;
      input: MessageCampaignCreate;
      correlationId: string;
    },
  ): Promise<
    | { ok: true; recipient: CampaignRecipient }
    | {
        ok: false;
        error: {
          code: MessageCampaignSendErrorCode;
          message: string;
          details?: string[];
        };
      }
  >;
}

export interface MessageCampaignSendPorts<Campaign, CampaignRecipient> {
  readonly maxAttachments: number;
  hashRequest(fingerprint: string): string;
  validateAttachments(
    attachments: readonly { objectId: string; filename: string }[],
  ): Promise<MessageCampaignSendResult | { ok: true }>;
  transaction(
    context: RequestContext,
    work: (
      tx: MessageCampaignTransaction<Campaign, CampaignRecipient>,
    ) => Promise<
      MessageCampaignSendResult<{
        campaign: Campaign;
        recipients: readonly CampaignRecipient[];
      }>
    >,
  ): Promise<
    MessageCampaignSendResult<{
      campaign: Campaign;
      recipients: readonly CampaignRecipient[];
    }>
  >;
}

/** Core orchestration for campaign creation; adapters provide transaction-scoped persistence only. */
export async function sendMessageCampaign<Campaign, CampaignRecipient>(
  context: RequestContext,
  eventId: string,
  idempotencyKey: string,
  input: MessageCampaignCreate,
  actor: string,
  ports: MessageCampaignSendPorts<Campaign, CampaignRecipient>,
  strategy: MessageCampaignDeliveryStrategy<
    Campaign,
    CampaignRecipient
  > = messageCampaignDelivery<Campaign, CampaignRecipient>(),
): Promise<
  MessageCampaignSendResult<{
    campaign: Campaign;
    recipients: readonly CampaignRecipient[];
  }>
> {
  const templateErrors = validateMessageTemplate(input.subject, input.text);
  if (templateErrors.length)
    return {
      ok: false,
      error: {
        code: 'invalid-template',
        message: 'Message template is invalid',
        details: templateErrors,
      },
    };
  if (input.attachments.length > ports.maxAttachments)
    return {
      ok: false,
      error: { code: 'too-many-attachments', message: 'Too many attachments' },
    };
  const attachmentError = await ports.validateAttachments(input.attachments);
  if (!attachmentError.ok) return { ok: false, error: attachmentError.error };
  const requestHash = ports.hashRequest(fingerprintMessageRequest(input));
  return ports.transaction(context, async (tx) => {
    const resolved = await tx.resolveRecipients(eventId, input.recipients);
    if (!resolved)
      return {
        ok: false,
        error: { code: 'event-not-found', message: 'Event not found' },
      };
    if (!resolved.length)
      return {
        ok: false,
        error: {
          code: 'no-recipients',
          message: 'No recipients match the selection',
        },
      };
    const recipientValidation = strategy.validateRecipients(resolved);
    if (!recipientValidation.ok) return recipientValidation;
    const existing = await tx.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash)
        return {
          ok: false,
          error: {
            code: 'idempotency-conflict',
            message:
              'Idempotency key was already used with a different request',
          },
        };
      return {
        ok: true,
        campaign: {
          campaign: existing.campaign,
          recipients: existing.recipients,
        },
        replayed: true,
      };
    }
    const campaign = await tx.createCampaign({
      eventId,
      idempotencyKey,
      requestHash,
      subject: input.subject,
      text: input.text,
      actor,
    });
    if (!campaign) {
      const concurrent = await tx.findByIdempotencyKey(idempotencyKey);
      if (concurrent?.requestHash === requestHash)
        return {
          ok: true,
          campaign: {
            campaign: concurrent.campaign,
            recipients: concurrent.recipients,
          },
          replayed: true,
        };
      return {
        ok: false,
        error: {
          code: 'idempotency-conflict',
          message: 'Idempotency key was concurrently used',
        },
      };
    }
    await tx.recordAudit(campaign, actor, strategy.auditAction);
    const locale = await tx.getLocale();
    for (const recipient of resolved) {
      const result = await strategy.enqueue(tx, {
        campaign,
        eventId,
        recipient,
        locale,
        input,
        correlationId: context.correlationId,
      });
      if (!result.ok) return result;
    }
    const sendingCampaign = await tx.markSending(campaign);
    const recipients = await tx.listRecipients(sendingCampaign);
    return {
      ok: true,
      campaign: { campaign: sendingCampaign, recipients },
    };
  });
}
