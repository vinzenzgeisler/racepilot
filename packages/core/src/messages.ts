import type { RequestContext } from './context.js';

export interface MessageRecipientFilter {
  classIds: string[];
  statuses: string[];
  emailVerified?: boolean | undefined;
  payment: 'any' | 'paid' | 'open' | 'unpaid';
  entryIds: string[];
  additionalAddresses: string[];
}

export interface MessageTemplate {
  id?: string | undefined;
  eventId: string | null;
  name: string;
  subject: string;
  text: string;
}

export interface MessageCampaignCreate {
  eventId: string;
  recipients: MessageRecipientFilter;
  subject: string;
  text: string;
  attachments: Array<{ objectId: string; filename: string }>;
}

export const messagePlaceholderNames = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'eventName',
  'className',
  'entryNumber',
] as const;
const messagePlaceholderNameSet: ReadonlySet<string> = new Set(
  messagePlaceholderNames,
);
export type MessagePlaceholder = (typeof messagePlaceholderNames)[number];
export type MessageRecipient = Readonly<Record<MessagePlaceholder, string>>;

export function messagePlaceholders(subject: string, text: string): string[] {
  const found = new Set<string>();
  for (const match of `${subject}\n${text}`.matchAll(/{{\s*([^{}]+?)\s*}}/g))
    found.add(match[1]!);
  return [...found];
}

export function validateMessageTemplate(
  subject: string,
  text: string,
): string[] {
  const unknown = messagePlaceholders(subject, text).filter(
    (name) => !messagePlaceholderNameSet.has(name),
  );
  if (
    /[{}]/.test(
      subject
        .replace(/{{\s*[^{}]+?\s*}}/g, '')
        .concat(text.replace(/{{\s*[^{}]+?\s*}}/g, '')),
    )
  )
    unknown.push('malformed placeholder');
  return [...new Set(unknown)];
}

export function renderMessageTemplate(
  subject: string,
  text: string,
  recipient: MessageRecipient,
): { subject: string; text: string } {
  const errors = validateMessageTemplate(subject, text);
  if (errors.length)
    throw new Error(`Invalid message template: ${errors.join(', ')}`);
  const render = (value: string) =>
    value.replace(
      /{{\s*([^{}]+?)\s*}}/g,
      (_match, name: MessagePlaceholder) => recipient[name],
    );
  return { subject: render(subject), text: render(text) };
}

export interface MessageRecipientCandidate {
  address: string | null;
  entryId: string;
  classId: string;
  verificationStatus: string;
  acceptanceStatus: string;
  paymentStatus: 'paid' | 'open' | 'unpaid';
  registrationGroupId?: string | null;
  firstName: string;
  lastName: string;
  eventName: string;
  className: string;
  entryNumber: string;
}

/** Resolve event candidates against all business filters before address deduplication. */
export function resolveMessageRecipientCandidates(
  candidates: readonly MessageRecipientCandidate[],
  filter: MessageRecipientFilter,
): Array<MessageRecipientCandidate & { address: string }> {
  const selected = candidates.filter((candidate) => {
    if (filter.classIds.length && !filter.classIds.includes(candidate.classId))
      return false;
    if (filter.entryIds.length && !filter.entryIds.includes(candidate.entryId))
      return false;
    if (
      filter.statuses.length &&
      !filter.statuses.includes(candidate.acceptanceStatus)
    )
      return false;
    if (
      filter.emailVerified !== undefined &&
      (candidate.verificationStatus === 'verified') !== filter.emailVerified
    )
      return false;
    return (
      filter.payment === 'any' || candidate.paymentStatus === filter.payment
    );
  });
  return deduplicateMessageRecipients(selected, filter.additionalAddresses);
}

/** Preserve the first registration for an address and merge manually supplied addresses. */
export function deduplicateMessageRecipients(
  entries: readonly MessageRecipientCandidate[],
  additionalAddresses: readonly string[] = [],
): Array<MessageRecipientCandidate & { address: string }> {
  const result = new Map<
    string,
    MessageRecipientCandidate & { address: string }
  >();
  for (const candidate of entries) {
    const address = candidate.address?.trim().toLocaleLowerCase('en-US');
    if (address && !result.has(address))
      result.set(address, { ...candidate, address });
  }
  for (const addressValue of additionalAddresses) {
    const address = addressValue.trim().toLocaleLowerCase('en-US');
    if (!result.has(address))
      result.set(address, {
        address,
        entryId: '',
        classId: '',
        verificationStatus: 'unverified',
        acceptanceStatus: 'pending',
        paymentStatus: 'unpaid',
        firstName: '',
        lastName: '',
        eventName: '',
        className: '',
        entryNumber: '',
      });
  }
  return [...result.values()];
}

export type MessageCampaignState = 'planned' | 'sending' | 'sent' | 'failed';
export type MessageRecipientState = MessageCampaignState;

const campaignTransitions: Readonly<
  Record<MessageCampaignState, readonly MessageCampaignState[]>
> = {
  planned: ['sending', 'failed'],
  sending: ['sent', 'failed'],
  sent: [],
  failed: ['planned'],
};

export function canTransitionMessageCampaign(
  current: MessageCampaignState,
  next: MessageCampaignState,
): boolean {
  return campaignTransitions[current].includes(next);
}

export function transitionMessageCampaign(
  current: MessageCampaignState,
  next: MessageCampaignState,
): MessageCampaignState {
  if (!canTransitionMessageCampaign(current, next))
    throw new Error(
      `Invalid message campaign transition: ${current} -> ${next}`,
    );
  return next;
}

const recipientTransitions: Readonly<
  Record<MessageRecipientState, readonly MessageRecipientState[]>
> = {
  planned: ['sending', 'failed'],
  sending: ['planned', 'sent', 'failed'],
  sent: [],
  failed: ['planned'],
};

export function transitionMessageRecipient(
  current: MessageRecipientState,
  next: MessageRecipientState,
): MessageRecipientState {
  if (!recipientTransitions[current].includes(next))
    throw new Error(
      `Invalid message recipient transition: ${current} -> ${next}`,
    );
  return next;
}

/** Canonical fingerprint used by persistence adapters to reject key reuse with a different request. */
export function fingerprintMessageRequest(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (typeof input === 'object' && input !== null)
      return Object.fromEntries(
        Object.entries(input)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, canonicalize(item)]),
      );
    return input;
  };
  return JSON.stringify(canonicalize(value));
}

export type MessageCampaignSendErrorCode =
  | 'invalid-template'
  | 'too-many-attachments'
  | 'attachment-unavailable'
  | 'attachment-too-large'
  | 'no-recipients'
  | 'idempotency-conflict'
  | 'event-not-found'
  | 'storage-unavailable';

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
  recordAudit(campaign: Campaign, actor: string): Promise<void>;
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
    if (!campaign)
      return {
        ok: false,
        error: {
          code: 'idempotency-conflict',
          message: 'Idempotency key was concurrently used',
        },
      };
    await tx.recordAudit(campaign, actor);
    const locale = await tx.getLocale();
    const attachments = input.attachments.map((item) => ({
      objectId: item.objectId,
      filename: item.filename,
    }));
    for (const recipient of resolved) {
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
    await tx.markSending(campaign);
    const recipients = await tx.listRecipients(campaign);
    return {
      ok: true,
      campaign: tx.toResponse(campaign, recipients),
    };
  });
}
