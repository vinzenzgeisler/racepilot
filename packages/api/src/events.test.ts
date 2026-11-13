import { describe, expect, it } from 'vitest';
import { createApp } from './index.js';
import { organizationId } from '@racepilot/core';
import { testDeps } from './testing.js';

const eventId = '20000000-0000-4000-8000-000000000001';
const org = {
  id: organizationId('10000000-0000-4000-8000-000000000001'),
  slug: 'demo',
  name: 'Demo',
  status: 'active' as const,
  contactEmail: null,
  websiteUrl: null,
  timezone: 'UTC',
  locale: 'de',
  currency: 'EUR',
};
const event = {
  id: eventId,
  organizationId: org.id,
  slug: 'rallye-2027',
  name: 'Rallye 2027',
  startsOn: '2027-06-01',
  endsOn: '2027-06-02',
  status: 'draft' as const,
  registrationOpensAt: null,
  registrationClosesAt: null,
  openedAt: null,
  closedAt: null,
  archivedAt: null,
};
const eventClass = {
  id: '30000000-0000-4000-8000-000000000001',
  organizationId: org.id,
  eventId,
  name: 'Motorrad',
  code: 'MOTO',
  vehicleType: 'motorcycle' as const,
  sortOrder: 0,
  maxParticipants: null,
  closed: false,
  passengerMode: 'optional' as const,
};
const validTerms = [
  {
    key: 'participation',
    version: '1',
    language: 'de' as const,
    text: 'Teilnahmebedingungen',
    hash: 'a'.repeat(64),
  },
];

function readinessApp(
  input: {
    classes?: (typeof eventClass)[];
    prices?: Array<{
      classId: string;
      baseCents: number;
      additionalEntryAdjustmentCents: number;
      earlyBirdDeadline: null;
      earlyBirdDiscountCents: number;
    }>;
    terms?: typeof validTerms | null;
  } = {},
) {
  let transitions = 0;
  const deps = testDeps({
    config: { deploymentMode: 'community', organizationId: org.id },
    organizations: {
      getById: async () => org,
      update: async (_ctx, patch) => ({ ...org, ...patch }),
    },
    events: {
      listByOrganization: async () => [event],
      getById: async () => event,
      transition: async () => {
        transitions += 1;
        return { ...event, status: 'open' as const };
      },
    },
    classes: {
      listByEvent: async () => input.classes ?? [eventClass],
      create: async () => eventClass,
      update: async () => eventClass,
    },
    pricing: {
      listByEvent: async () =>
        input.prices ?? [
          {
            classId: eventClass.id,
            baseCents: 2550,
            additionalEntryAdjustmentCents: 0,
            earlyBirdDeadline: null,
            earlyBirdDiscountCents: 0,
          },
        ],
      upsert: async (_ctx, _eventId, rule) => rule,
    },
    eventConsents: {
      get: async () => (input.terms === undefined ? validTerms : input.terms),
      update: async () => validTerms,
    },
    authenticator: {
      authenticate: async () => ({ issuer: 'test', subject: 'admin' }),
    },
    memberships: {
      resolvePermissions: async () =>
        new Set(['event:write', 'event:read', 'class:write']),
    },
  });
  return { app: createApp(deps), transitions: () => transitions };
}

async function open(app: ReturnType<typeof readinessApp>['app']) {
  return app.request(`/admin/events/${eventId}/transitions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'open' }),
  });
}

describe('opening an event', () => {
  it.each([
    ['without any classes', { classes: [] }, 'mindestens eine offene Klasse'],
    [
      'when every class is locked',
      { classes: [{ ...eventClass, closed: true }] },
      'mindestens eine offene Klasse',
    ],
    ['without a price rule', { prices: [] }, 'Startgeld'],
    [
      'without published participation terms',
      { terms: [] },
      'Teilnahmebedingungen',
    ],
  ])(
    'rejects opening %s before transitioning',
    async (_caseName, setup, message) => {
      const { app, transitions } = readinessApp(setup);
      const response = await open(app);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining(message),
      });
      expect(transitions()).toBe(0);
    },
  );

  it('maps incomplete price rule merges to 422', async () => {
    const { app } = readinessApp({ prices: [] });
    const response = await app.request(
      `/admin/events/${eventId}/pricing/${eventClass.id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseCents: 2500 }),
      },
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Invalid price rule' });
  });

  it('opens when a usable class, price and published participation terms exist', async () => {
    const { app, transitions } = readinessApp();
    const response = await open(app);
    expect(response.status).toBe(200);
    expect(transitions()).toBe(1);
  });
});
