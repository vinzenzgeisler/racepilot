import { describe, expect, it } from 'vitest';
import {
  organizationId,
  type Entry,
  type PassengerAdminRepository,
  type PassengerPublicRepository,
} from '@racepilot/core';
import { createApp } from './index.js';
import { createInMemoryRegistrationRateLimiter } from './rate-limit.js';
import { testDeps, testRegistration } from './testing.js';

const org = organizationId('11111111-1111-4111-8111-111111111111');
const entryId = '33333333-3333-4333-8333-333333333333';
const token = 'a'.repeat(43);
const env = { incoming: { socket: { remoteAddress: '203.0.113.7' } } };
const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function appWith(
  permissions: string[],
  overrides: {
    admin?: Partial<PassengerAdminRepository>;
    public?: Partial<PassengerPublicRepository>;
    passengers?: boolean;
    detail?: Partial<NonNullable<Entry['adminDetails']>>;
  } = {},
  calls: unknown[] = [],
) {
  const admin: PassengerAdminRepository = {
    add: async (ctx, id, input, actor) => {
      calls.push(['add', ctx.organizationId, id, input, actor]);
      return { status: 'created' };
    },
    issueLink: async (ctx, id, input, actor) => {
      calls.push(['link', ctx.organizationId, id, input, actor]);
      return {
        status: 'created',
        url: 'https://entries.example.test/passenger?token=abc',
        expiresAt: '2030-01-01T00:00:00.000Z',
        mailQueued: true,
      };
    },
    ...overrides.admin,
  };
  const publicRepo: PassengerPublicRepository = {
    resolve: async (ctx, value) => {
      calls.push(['resolve', ctx.organizationId, value]);
      return value === token
        ? {
            eventName: 'Bergpreis',
            className: 'M4',
            driverName: 'Tom P.',
            language: 'de',
            passenger: {
              firstName: 'Max',
              lastName: 'Beifahrer',
              email: null,
              dateOfBirth: null,
              country: null,
              phone: null,
              street: null,
              postalCode: null,
              city: null,
              emergencyContactName: null,
              emergencyContactPhone: null,
            },
            terms: [],
            expiresAt: '2030-01-01T00:00:00.000Z',
          }
        : null;
    },
    complete: async (ctx, value, language, passenger, consents) => {
      calls.push([
        'complete',
        ctx.organizationId,
        value,
        language,
        passenger,
        consents,
      ]);
      return value === token ? 'completed' : 'unavailable';
    },
    ...overrides.public,
  };
  return createApp(
    testDeps({
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
            ? ({
                id,
                organizationId: ctx.organizationId,
                adminDetails: overrides.detail,
              } as Entry)
            : null,
        transition: async () => null,
        softDelete: async () => null,
      },
      entryWorkflows: { getPinnedForEntry: async () => null },
      entryAdminActions: { availableActions: async () => [] },
      publicRegistration: testRegistration(
        {},
        createInMemoryRegistrationRateLimiter(),
      ),
      ...(overrides.passengers === false
        ? {}
        : { passengers: { admin, public: publicRepo } }),
    }),
  );
}

describe('co-driver routes', () => {
  it('adds a co-driver and creates a link only for entry writers, with the server-side actor', async () => {
    const calls: unknown[] = [];
    const reader = appWith(['entry:read'], {}, calls);
    for (const path of ['passenger', 'passenger/link'])
      expect(
        (
          await reader.request(
            `/admin/entries/${entryId}/${path}`,
            json('POST', { firstName: 'Max', lastName: 'Beifahrer' }),
          )
        ).status,
      ).toBe(403);
    expect(calls).toEqual([]);

    const writer = appWith(['entry:read', 'entry:write'], {}, calls);
    const added = await writer.request(
      `/admin/entries/${entryId}/passenger`,
      json('POST', {
        firstName: ' Max ',
        lastName: 'Beifahrer',
        email: 'max@example.test',
      }),
    );
    expect(added.status).toBe(201);
    const link = await writer.request(
      `/admin/entries/${entryId}/passenger/link`,
      json('POST', { email: 'max@example.test' }),
    );
    expect(link.status).toBe(201);
    expect(await link.json()).toEqual({
      url: 'https://entries.example.test/passenger?token=abc',
      expiresAt: '2030-01-01T00:00:00.000Z',
      mailQueued: true,
    });
    expect(calls).toEqual([
      [
        'add',
        org,
        entryId,
        { firstName: 'Max', lastName: 'Beifahrer', email: 'max@example.test' },
        'https://id.example#admin',
      ],
      [
        'link',
        org,
        entryId,
        { email: 'max@example.test' },
        'https://id.example#admin',
      ],
    ]);
  });

  it('rejects malformed requests and maps the repository results', async () => {
    const results = (status: string) =>
      appWith(['entry:read', 'entry:write'], {
        admin: {
          add: async () => ({ status }) as never,
          issueLink: async () => ({ status }) as never,
        },
      });
    const post = (
      app: ReturnType<typeof appWith>,
      path: string,
      body: unknown,
    ) => app.request(`/admin/entries/${entryId}/${path}`, json('POST', body));
    const app = results('created');
    expect((await post(app, 'passenger', { firstName: 'Max' })).status).toBe(
      400,
    );
    expect(
      (
        await post(app, 'passenger', {
          firstName: 'Max',
          lastName: 'B',
          email: 'no-mail',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(app, 'passenger', {
          firstName: 'Max',
          lastName: 'B',
          organizationId: 'x',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          '/admin/entries/not-a-uuid/passenger/link',
          json('POST', {}),
        )
      ).status,
    ).toBe(400);
    const named = { firstName: 'Max', lastName: 'B' };
    for (const [status, expected] of [
      ['not_found', 404],
      ['exists', 409],
      ['unavailable', 422],
    ] as const)
      expect((await post(results(status), 'passenger', named)).status).toBe(
        expected,
      );
    for (const [status, expected] of [
      ['not_found', 404],
      ['completed', 409],
      ['no_passenger', 422],
      ['unavailable', 422],
    ] as const)
      expect((await post(results(status), 'passenger/link', {})).status).toBe(
        expected,
      );
  });

  it('offers the actions only where a co-driver fits and the facility is wired', async () => {
    const actionsOf = async (
      detail: Record<string, unknown>,
      options: NonNullable<Parameters<typeof appWith>[1]> = {},
      permissions = ['entry:read', 'entry:write'],
    ) => {
      const response = await appWith(permissions, {
        ...options,
        detail: detail as never,
      }).request(`/admin/entries/${entryId}`);
      return ((await response.json()) as { availableActions: string[] })
        .availableActions;
    };
    const base: Record<string, unknown> = { passengerMode: 'optional' };
    expect(await actionsOf(base)).toEqual(['passenger:add', 'passenger:link']);
    expect(await actionsOf({ ...base, passengerMode: 'none' })).toEqual([]);
    expect(
      await actionsOf({
        ...base,
        passenger: { status: 'invited' },
      }),
    ).toEqual(['passenger:link']);
    expect(
      await actionsOf({
        ...base,
        passenger: { status: 'completed' },
      }),
    ).toEqual([]);
    expect(await actionsOf(base, { passengers: false })).toEqual([]);
    expect(await actionsOf(base, {}, ['entry:read'])).toEqual([]);
  });

  it('serves the personal link without an account, answers every unusable token alike and rate-limits it', async () => {
    const calls: unknown[] = [];
    const app = appWith([], {}, calls);
    const ok = await app.request(
      '/public/passenger-links/resolve',
      json('POST', { token }),
      env,
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ passenger: { firstName: 'Max' } });
    const unknown = await app.request(
      '/public/passenger-links/resolve',
      json('POST', { token: 'b'.repeat(43) }),
      env,
    );
    const malformed = await app.request(
      '/public/passenger-links/resolve',
      json('POST', { token: 'short' }),
      env,
    );
    expect([unknown.status, malformed.status]).toEqual([404, 404]);
    expect(await unknown.json()).toEqual(await malformed.json());

    const body = {
      token,
      language: 'de',
      passenger: {
        firstName: 'Max',
        lastName: 'Beifahrer',
        dateOfBirth: '1988-03-03',
        phone: '+49 351 111',
      },
      consents: [],
    };
    const done = await app.request(
      '/public/passenger-links/complete',
      json('POST', body),
      env,
    );
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ completed: true });
    expect(calls.at(-1)).toEqual([
      'complete',
      org,
      token,
      'de',
      expect.objectContaining({ dateOfBirth: '1988-03-03' }),
      [],
    ]);
    // Unknown properties and a missing date of birth never reach the repository.
    for (const bad of [
      { ...body, passenger: { ...body.passenger, dateOfBirth: undefined } },
      { ...body, passenger: { ...body.passenger, entryId } },
      { ...body, organizationId: org },
    ])
      expect(
        (
          await app.request(
            '/public/passenger-links/complete',
            json('POST', bad),
            env,
          )
        ).status,
      ).toBe(400);

    // Every attempt from one client counts: the budget runs out.
    let limited = 0;
    for (let attempt = 0; attempt < 40; attempt++)
      limited +=
        (
          await app.request(
            '/public/passenger-links/resolve',
            json('POST', { token: 'c'.repeat(43) }),
            env,
          )
        ).status === 429
          ? 1
          : 0;
    expect(limited).toBeGreaterThan(0);
  });

  it('maps completion refusals and installs no routes without the facility', async () => {
    const refuse = (result: string) =>
      appWith([], {
        public: { complete: async () => result as never },
      });
    const body = {
      token,
      language: 'de',
      passenger: {
        firstName: 'Max',
        lastName: 'Beifahrer',
        dateOfBirth: '1988-03-03',
      },
      consents: [],
    };
    const status = async (result: string) =>
      (
        await refuse(result).request(
          '/public/passenger-links/complete',
          json('POST', body),
          env,
        )
      ).status;
    expect(await status('guardian_required')).toBe(422);
    expect(await status('terms_required')).toBe(400);
    expect(await status('terms_mismatch')).toBe(400);
    expect(await status('unavailable')).toBe(404);
    const without = appWith(['entry:read', 'entry:write'], {
      passengers: false,
    });
    expect(
      (
        await without.request(
          '/public/passenger-links/resolve',
          json('POST', { token }),
          env,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await without.request(
          `/admin/entries/${entryId}/passenger`,
          json('POST', { firstName: 'Max', lastName: 'B' }),
        )
      ).status,
    ).toBe(404);
  });
});
