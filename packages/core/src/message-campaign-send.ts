import type { RequestContext } from './context.js';
import {
  fingerprintMessageRequest,
  renderMessageTemplate,
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

export interface MessageCampaignTransaction<
  Campaign,
  CampaignRecipient,
  Response = unknown,
> {
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
  enqueueVerificationRecipient?(input: {
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
  markSending(campaign: Campaign): Promise<void>;
  listRecipients(campaign: Campaign): Promise<readonly CampaignRecipient[]>;
  toResponse(
    campaign: Campaign,
    recipients: readonly CampaignRecipient[],
  ): Response;
}

export interface MessageCampaignSendPorts<
  Campaign,
  CampaignRecipient,
  Response = unknown,
> {
  readonly maxAttachments: number;
  validateAttachments(
    attachments: readonly { objectId: string; filename: string }[],
  ): Promise<MessageCampaignSendResult | null>;
  transaction(
    context: RequestContext,
    work: (
      tx: MessageCampaignTransaction<Campaign, CampaignRecipient, Response>,
    ) => Promise<MessageCampaignSendResult<Response>>,
  ): Promise<MessageCampaignSendResult<Response>>;
}

/** Core orchestration for campaign creation; adapters provide transaction-scoped persistence only. */
export async function sendMessageCampaign<
  Campaign,
  CampaignRecipient,
  Response,
>(
  context: RequestContext,
  eventId: string,
  idempotencyKey: string,
  input: MessageCampaignCreate,
  actor: string,
  ports: MessageCampaignSendPorts<Campaign, CampaignRecipient, Response>,
  mode: { kind: 'campaign' | 'verification'; auditAction?: string } = {
    kind: 'campaign',
  },
): Promise<MessageCampaignSendResult<Response>> {
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
  if (attachmentError && !attachmentError.ok)
    return { ok: false, error: attachmentError.error };
  const requestHash = fingerprintMessageRequest(input);
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
        campaign: tx.toResponse(existing.campaign, existing.recipients),
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
          campaign: tx.toResponse(concurrent.campaign, concurrent.recipients),
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
    await tx.recordAudit(campaign, actor, mode.auditAction ?? 'send');
    const locale = await tx.getLocale();
    const attachments = input.attachments.map((item) => ({
      objectId: item.objectId,
      filename: item.filename,
    }));
    for (const recipient of resolved) {
      if (mode.kind === 'verification') {
        if (!tx.enqueueVerificationRecipient)
          throw new Error('Verification delivery is unavailable');
        await tx.enqueueVerificationRecipient({
          campaign,
          eventId,
          recipient,
          locale,
          correlationId: context.correlationId,
        });
      } else {
        const rendered = renderMessageTemplate(
          input.subject,
          input.text,
          recipient,
        );
        await tx.enqueueRecipient({
          campaign,
          eventId,
          recipient,
          subject: rendered.subject,
          text: rendered.text,
          locale,
          attachmentRefs: attachments,
          correlationId: context.correlationId,
        });
      }
    }
    await tx.markSending(campaign);
    const recipients = await tx.listRecipients(campaign);
    return {
      ok: true,
      campaign: tx.toResponse(campaign, recipients),
    };
  });
}
