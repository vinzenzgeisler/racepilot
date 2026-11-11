import { describe, expect, it } from 'vitest';
import { createRequestContext, organizationId } from './context.js';
import { getEventOverview } from './overview.js';

const context = createRequestContext({
  deploymentMode: 'cloud',
  organizationId: organizationId('11111111-1111-4111-8111-111111111111'),
  permissions: new Set(['entry:read']),
  capabilities: new Set(),
  correlationId: 'overview-test',
});

describe('event overview use case', () => {
  it('returns the repository projection without further reads', async () => {
    const overview = {
      eventId: '22222222-2222-4222-8222-222222222222',
      statuses: { accepted: 2 },
      openPayments: { count: 1, amountCents: 1200, currency: 'EUR' },
      classes: [],
      daysUntilRegistrationCloses: 4,
      warnings: [],
    };
    let calls = 0;
    const result = await getEventOverview(
      context,
      {
        getEventOverview: async (_ctx, eventId, now) => {
          calls++;
          expect(eventId).toBe(overview.eventId);
          expect(now).toBeInstanceOf(Date);
          return { ok: true, overview };
        },
      },
      overview.eventId,
    );
    expect(result).toEqual({ ok: true, overview });
    expect(calls).toBe(1);
  });

  it('preserves the typed not-found result', async () => {
    const result = await getEventOverview(
      context,
      {
        getEventOverview: async () => ({ ok: false, error: 'event-not-found' }),
      },
      '22222222-2222-4222-8222-222222222222',
    );
    expect(result).toEqual({ ok: false, error: 'event-not-found' });
  });
});
