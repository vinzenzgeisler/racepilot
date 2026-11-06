import { describe, expect, it } from 'vitest';
import { organizationId, type Entry } from '@racepilot/core';
import { createApp } from './index.js';

const org = organizationId('11111111-1111-4111-8111-111111111111');
const entryId = '33333333-3333-4333-8333-333333333333';
const foreignEntryId = '44444444-4444-4444-8444-444444444444';

function appWith(permissions: string[], calls: unknown[] = []) {
  return createApp({
    config: { deploymentMode: 'community', organizationId: org },
    organizations: { getById: async () => null, update: async () => null },
    events: { listByOrganization: async () => [], getById: async () => null },
    authenticator: {
      authenticate: async () => ({
        issuer: 'https://id.example',
        subject: 'admin',
      }),
    },
    memberships: { resolvePermissions: async () => new Set(permissions) },
    entries: {
      getById: async (ctx, id) =>
        id === entryId
          ? ({ id, organizationId: ctx.organizationId } as Entry)
          : null,
      transition: async () => null,
      softDelete: async () => null,
    },
    entryDetails: {
      updateDriver: async (ctx, id, patch, actor) => {
        calls.push(['driver', ctx.organizationId, id, patch, actor]);
        if (patch.firstName === 'Shared') return 'person_shared';
        return id === entryId ? 'updated' : 'not_found';
      },
      updateVehicle: async (ctx, id, patch, actor) => {
        calls.push(['vehicle', ctx.organizationId, id, patch, actor]);
        return id === entryId ? 'updated' : 'not_found';
      },
      listMessages: async (_ctx, id) =>
        id === entryId
          ? [
              {
                id: '55555555-5555-4555-8555-555555555555',
                status: 'sent',
                subject: 'Nennung eingegangen: Bergpreis',
                templateKey: 'entry-received',
                recipient: 'tom@example.test',
                createdAt: '2030-01-01T00:00:00.000Z',
                sentAt: '2030-01-01T00:00:05.000Z',
              },
            ]
          : null,
    },
  });
}
const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('entry detail routes', () => {
  it('edits driver and vehicle with the server-side actor and tenant', async () => {
    const calls: unknown[] = [];
    const app = appWith(['entry:read', 'entry:write'], calls);
    const driver = await app.request(
      `/admin/entries/${entryId}/driver`,
      json('PATCH', {
        phone: ' +49 1 ',
        city: '',
        publicationPreference: 'hidden',
      }),
    );
    expect(driver.status).toBe(200);
    expect(await driver.json()).toMatchObject({ id: entryId });
    const vehicle = await app.request(
      `/admin/entries/${entryId}/vehicle`,
      json('PATCH', { displacementCc: 249, history: 'Neuaufbau 2019' }),
    );
    expect(vehicle.status).toBe(200);
    expect(calls).toEqual([
      [
        'driver',
        org,
        entryId,
        { phone: '+49 1', city: null, publicationPreference: 'hidden' },
        'https://id.example#admin',
      ],
      [
        'vehicle',
        org,
        entryId,
        { displacementCc: 249, history: 'Neuaufbau 2019' },
        'https://id.example#admin',
      ],
    ]);
  });
  it('rejects spoofed tenants, unknown fields, empty and invalid patches', async () => {
    const calls: unknown[] = [];
    const app = appWith(['entry:read', 'entry:write'], calls);
    for (const body of [
      { organizationId: '22222222-2222-4222-8222-222222222222', city: 'X' },
      { city: 'X', unknown: 1 },
      {},
      { country: 'Deutschland' },
      { firstName: '   ' },
    ])
      expect(
        (
          await app.request(
            `/admin/entries/${entryId}/driver`,
            json('PATCH', body),
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await app.request(
          `/admin/entries/${entryId}/vehicle`,
          json('PATCH', { cylinders: 99 }),
        )
      ).status,
    ).toBe(400);
    expect(calls).toEqual([]);
  });
  it('answers 404 for entries outside the tenant and 403 without write permission', async () => {
    const app = appWith(['entry:read', 'entry:write']);
    expect(
      (
        await app.request(
          `/admin/entries/${foreignEntryId}/driver`,
          json('PATCH', { city: 'X' }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await app.request(`/admin/entries/${foreignEntryId}/messages`)).status,
    ).toBe(404);
    const readOnly = appWith(['entry:read']);
    expect(
      (
        await readOnly.request(
          `/admin/entries/${entryId}/vehicle`,
          json('PATCH', { make: 'X' }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await appWith([]).request(`/admin/entries/${entryId}/messages`)).status,
    ).toBe(403);
  });
  it('answers 409 when the person is shared with other registrations', async () => {
    const response = await appWith(['entry:read', 'entry:write']).request(
      `/admin/entries/${entryId}/driver`,
      json('PATCH', { firstName: 'Shared' }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'person_shared' });
  });
  it('lists the mails of an entry', async () => {
    const response = await appWith(['entry:read']).request(
      `/admin/entries/${entryId}/messages`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        expect.objectContaining({
          status: 'sent',
          subject: 'Nennung eingegangen: Bergpreis',
        }),
      ],
    });
  });
});
