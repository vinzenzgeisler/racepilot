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
  for (const match of `${subject}\n${text}`.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
    const [, name] = match;
    if (name) found.add(name);
  }
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
):
  | { ok: true; value: { subject: string; text: string } }
  | { ok: false; errors: string[] } {
  const errors = validateMessageTemplate(subject, text);
  if (errors.length) return { ok: false, errors };
  const render = (value: string) =>
    value.replace(
      /{{\s*([^{}]+?)\s*}}/g,
      (_match, name: MessagePlaceholder) => recipient[name],
    );
  return { ok: true, value: { subject: render(subject), text: render(text) } };
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
):
  | { ok: true; value: MessageCampaignState }
  | { ok: false; error: 'invalid-transition' } {
  return canTransitionMessageCampaign(current, next)
    ? { ok: true, value: next }
    : { ok: false, error: 'invalid-transition' };
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
):
  | { ok: true; value: MessageRecipientState }
  | { ok: false; error: 'invalid-transition' } {
  return recipientTransitions[current].includes(next)
    ? { ok: true, value: next }
    : { ok: false, error: 'invalid-transition' };
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
