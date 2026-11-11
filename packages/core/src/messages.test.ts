import { describe, expect, it } from 'vitest';
import {
  deduplicateMessageRecipients,
  renderMessageTemplate,
  validateMessageTemplate,
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
  it('deduplicates addresses case-insensitively and includes additional recipients', () => {
    const row = {
      address: 'Person@example.test',
      entryId: 'entry',
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
    expect(() => transitionMessageCampaign('sent', 'planned')).toThrow();
  });
});
