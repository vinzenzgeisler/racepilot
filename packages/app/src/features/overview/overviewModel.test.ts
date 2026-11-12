import { describe, expect, it } from 'vitest';
import {
  deadlineText,
  statusRows,
  totalEntries,
  warningFilters,
  warningText,
} from './overviewModel.js';

const eventId = '11111111-1111-4111-8111-111111111111';
const warning = {
  type: 'unverified-email',
  count: 7,
  filter: { eventId, verificationStatus: 'unverified' },
} as const;

describe('overview model', () => {
  it('orders known status categories first and keeps custom ones by name', () => {
    expect(
      statusRows({ zeta: 1, accepted: 4, pending: 2, alpha: 3 }).map(
        (row) => row.key,
      ),
    ).toEqual(['pending', 'accepted', 'alpha', 'zeta']);
    expect(statusRows({ accepted: 4 })[0]?.label).toBe('Zugelassen');
    expect(totalEntries({ accepted: 4, pending: 2 })).toBe(6);
  });

  it('words the deadline without inventing one', () => {
    expect(deadlineText(null).value).toBe('–');
    expect(deadlineText(1)).toEqual({ value: '1', detail: 'Tag' });
    expect(deadlineText(30)).toEqual({ value: '30', detail: 'Tage' });
    expect(deadlineText(0).detail).toMatch(/vorbei/);
  });

  it('uses the singular and the plural in warnings', () => {
    expect(warningText(warning)).toBe(
      '7 Nennungen ohne bestätigte E-Mail-Adresse',
    );
    expect(warningText({ ...warning, count: 1 })).toMatch(/^1 Nennung ohne/);
  });

  it('opens the list with exactly the delivered filter, and only for its own event', () => {
    expect(warningFilters(warning, eventId)).toEqual({
      verificationStatus: 'unverified',
    });
    expect(
      warningFilters(warning, '22222222-2222-4222-8222-222222222222'),
    ).toBeNull();
  });
});
