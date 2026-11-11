export const messagePlaceholderNames = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'eventName',
  'className',
  'entryNumber',
] as const;
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
    (name) => !(messagePlaceholderNames as readonly string[]).includes(name),
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
  firstName: string;
  lastName: string;
  eventName: string;
  className: string;
  entryNumber: string;
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
