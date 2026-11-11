import { describe, expect, it } from 'vitest';
import {
  deduplicateMessageRecipients,
  renderMessageTemplate,
  validateMessageTemplate,
  transitionMessageRecipient,
  resolveMessageRecipientCandidates,
} from './messages.js';

describe('message templates', () => {
  it('validates names and renders one recipient', () => {
    expect(
      validateMessageTemplate('Hi {{firstName}}', 'For {{eventName}}'),
    ).toEqual([]);
    expect(
      renderMessageTemplate('Hi {{firstName}}', 'For {{eventName}}', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        email: 'ada@example.test',
        eventName: 'Spring Run',
        className: 'A',
        entryNumber: '12',
      }),
    ).toEqual({ subject: 'Hi Ada', text: 'For Spring Run' });
    expect(validateMessageTemplate('{{unknown}}', 'body')).toContain('unknown');
  });
});

describe('message recipients', () => {
  it('keeps acceptance status and email verification as independent filters', () => {
    const candidate = {
      address: 'ada@example.test',
      entryId: 'entry-a',
      classId: 'class-a',
      verificationStatus: 'unverified',
      acceptanceStatus: 'accepted',
      paymentStatus: 'open' as const,
      firstName: 'Ada',
      lastName: 'Lovelace',
      eventName: 'Run',
      className: 'Open',
      entryNumber: '12',
    };
    expect(
      resolveMessageRecipientCandidates([candidate], {
        classIds: [],
        statuses: ['accepted'],
        emailVerified: false,
        payment: 'any',
        entryIds: [],
        additionalAddresses: [],
      }),
    ).toHaveLength(1);
    expect(
      resolveMessageRecipientCandidates([candidate], {
        classIds: [],
        statuses: ['unverified'],
        emailVerified: false,
        payment: 'any',
        entryIds: [],
        additionalAddresses: [],
      }),
    ).toHaveLength(0);
    expect(
      resolveMessageRecipientCandidates([candidate], {
        classIds: [],
        statuses: ['accepted'],
        emailVerified: true,
        payment: 'any',
        entryIds: [],
        additionalAddresses: [],
      }),
    ).toHaveLength(0);
  });

  it('resolves class, status, verification, payment and individual-entry filters in core', () => {
    const candidate = {
      address: 'ada@example.test',
      entryId: 'entry-a',
      classId: 'class-a',
      verificationStatus: 'verified',
      acceptanceStatus: 'accepted',
      paymentStatus: 'open' as const,
      registrationGroupId: 'group-a',
      firstName: 'Ada',
      lastName: 'Lovelace',
      eventName: 'Run',
      className: 'Open',
      entryNumber: '12',
    };
    const filter = {
      classIds: ['class-a'],
      statuses: ['accepted'],
      emailVerified: true,
      payment: 'open' as const,
      entryIds: ['entry-a'],
      additionalAddresses: [],
    };
    expect(resolveMessageRecipientCandidates([candidate], filter)).toHaveLength(
      1,
    );
    expect(
      resolveMessageRecipientCandidates([candidate], {
        ...filter,
        classIds: ['other'],
      }),
    ).toHaveLength(0);
    expect(
      resolveMessageRecipientCandidates([candidate], {
        ...filter,
        payment: 'paid',
      }),
    ).toHaveLength(0);
  });

  it('deduplicates addresses case-insensitively and includes additional recipients', () => {
    const row = {
      address: 'Person@example.test',
      entryId: 'entry',
      classId: 'class-a',
      verificationStatus: 'verified',
      acceptanceStatus: 'accepted',
      paymentStatus: 'open' as const,
      firstName: 'A',
      lastName: 'B',
      eventName: 'Run',
      className: 'A',
      entryNumber: '1',
    };
    expect(
      deduplicateMessageRecipients(
        [row, { ...row, address: 'person@EXAMPLE.test' }],
        ['other@example.test', 'OTHER@example.test'],
      ),
    ).toHaveLength(2);
  });
});

describe('message campaign state machine', () => {
  it('accepts only planned sending, terminal completion, and failed retry transitions', async () => {
    const { canTransitionMessageCampaign, transitionMessageCampaign } =
      await import('./messages.js');
    expect(canTransitionMessageCampaign('planned', 'sending')).toBe(true);
    expect(canTransitionMessageCampaign('sent', 'planned')).toBe(false);
    expect(transitionMessageCampaign('failed', 'planned')).toBe('planned');
    expect(transitionMessageRecipient('sending', 'planned')).toBe('planned');
    expect(() => transitionMessageCampaign('sent', 'planned')).toThrow();
  });
});

describe('message campaign send use case', () => {
  type TestCampaign = { id: string };
  type TestRecipient = { id: string };
  type TestResponse = { id: string };
  type TestPorts =
    import('./message-campaign-send.js').MessageCampaignSendPorts<
      TestCampaign,
      TestRecipient,
      TestResponse
    >;
  const context = {
    deploymentMode: 'community' as const,
    organizationId: 'org-a' as never,
    permissions: new Set<string>(),
    capabilities: new Set<string>(),
    correlationId: 'message-test',
  };
  const input = {
    eventId: 'event-a',
    recipients: {
      classIds: [],
      statuses: [],
      payment: 'any' as const,
      entryIds: [],
      additionalAddresses: [],
    },
    subject: 'Hello {{firstName}}',
    text: 'Welcome',
    attachments: [],
  };
  const transactionCalls: string[] = [];
  const transaction: import('./message-campaign-send.js').MessageCampaignTransaction<
    TestCampaign,
    TestRecipient,
    TestResponse
  > = {
    resolveRecipients: async (): Promise<
      import('./message-campaign-send.js').MessageCampaignRecipient[]
    > => {
      transactionCalls.push('resolve');
      return [];
    },
    findByIdempotencyKey: async () => null,
    createCampaign: async () => null,
    recordAudit: async () => {},
    getLocale: async () => 'en',
    enqueueRecipient: async () => ({ id: 'recipient-a' }),
    markSending: async () => {},
    listRecipients: async () => [],
    toResponse: () => ({ id: 'response-a' }),
  };
  const ports: TestPorts = {
    maxAttachments: 1,
    hashRequest: (fingerprint) => fingerprint,
    validateAttachments: async () => null,
    transaction: async (_context, work) => {
      transactionCalls.push('begin');
      return work(transaction);
    },
  };

  it('keeps template rejection typed and does not begin a transaction', async () => {
    const { sendMessageCampaign } = await import('./message-campaign-send.js');
    const result = await sendMessageCampaign(
      context,
      input.eventId,
      'key-001',
      {
        ...input,
        subject: '{{unknown}}',
      },
      'actor',
      ports,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid-template' },
    });
    expect(transactionCalls).toEqual([]);
  });

  it('returns typed attachment count and validation errors before opening a transaction', async () => {
    const { sendMessageCampaign } = await import('./message-campaign-send.js');
    const tooMany = await sendMessageCampaign(
      context,
      input.eventId,
      'key-001',
      {
        ...input,
        attachments: [
          { objectId: 'a', filename: 'a.pdf' },
          { objectId: 'b', filename: 'b.pdf' },
        ],
      },
      'actor',
      ports,
    );
    expect(tooMany).toMatchObject({
      ok: false,
      error: { code: 'too-many-attachments' },
    });
    const unavailablePorts: TestPorts = {
      ...ports,
      validateAttachments: async () => ({
        ok: false,
        error: { code: 'attachment-unavailable', message: 'Missing PDF' },
      }),
    };
    const unavailable = await sendMessageCampaign(
      context,
      input.eventId,
      'key-001',
      {
        ...input,
        attachments: [{ objectId: 'a', filename: 'a.pdf' }],
      },
      'actor',
      unavailablePorts,
    );
    expect(unavailable).toMatchObject({
      ok: false,
      error: { code: 'attachment-unavailable' },
    });
    expect(transactionCalls).toEqual([]);
  });

  it('resolves recipients inside the transaction and returns a typed empty-selection error', async () => {
    const { sendMessageCampaign } = await import('./message-campaign-send.js');
    const result = await sendMessageCampaign(
      context,
      input.eventId,
      'key-001',
      input,
      'actor',
      ports,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'no-recipients' },
    });
    expect(transactionCalls).toEqual(['begin', 'resolve']);
  });

  it('replays the existing campaign when the normalized request hash matches', async () => {
    const { sendMessageCampaign } = await import('./message-campaign-send.js');
    const matchingPorts: TestPorts = {
      ...ports,
      hashRequest: () => 'same-hash',
      transaction: async (_context, work) =>
        work({
          ...transaction,
          resolveRecipients: async (): Promise<
            import('./message-campaign-send.js').MessageCampaignRecipient[]
          > => [
            {
              entryId: 'entry-a',
              registrationGroupId: 'group-a',
              email: 'ada@example.test',
              firstName: 'Ada',
              lastName: 'Lovelace',
              fullName: 'Ada Lovelace',
              eventName: 'Run',
              className: 'Open',
              entryNumber: '1',
            },
          ],
          findByIdempotencyKey: async () => ({
            requestHash: 'same-hash',
            campaign: { id: 'campaign-a' },
            recipients: [{ id: 'recipient-a' }],
          }),
        }),
    };
    const result = await sendMessageCampaign(
      context,
      input.eventId,
      'key-001',
      input,
      'actor',
      matchingPorts,
    );
    expect(result).toMatchObject({
      ok: true,
      replayed: true,
      campaign: { id: 'response-a' },
    });
  });

  it('returns an idempotency conflict instead of an absent campaign', async () => {
    const { sendMessageCampaign } = await import('./message-campaign-send.js');
    const conflictPorts: TestPorts = {
      ...ports,
      transaction: async (_context, work) =>
        work({
          ...transaction,
          resolveRecipients: async (): Promise<
            import('./message-campaign-send.js').MessageCampaignRecipient[]
          > => [
            {
              entryId: 'entry-a',
              registrationGroupId: 'group-a',
              email: 'ada@example.test',
              firstName: 'Ada',
              lastName: 'Lovelace',
              fullName: 'Ada Lovelace',
              eventName: 'Run',
              className: 'Open',
              entryNumber: '1',
            },
          ],
          findByIdempotencyKey: async () => ({
            requestHash: 'different',
            campaign: { id: 'campaign-a' },
            recipients: [],
          }),
        }),
    };
    const result = await sendMessageCampaign(
      context,
      input.eventId,
      'key-001',
      input,
      'actor',
      conflictPorts,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'idempotency-conflict' },
    });
  });
});
