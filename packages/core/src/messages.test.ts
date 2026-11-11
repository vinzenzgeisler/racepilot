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
