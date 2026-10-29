import { describe, it, expect } from 'vitest';
import {
  createApp,
  createInMemoryRegistrationRateLimiter,
  loadConfig,
  type ApiDeps,
} from './index.js';
import type { RegistrationSettings } from '@racepilot/contracts';
import {
  createRequestContext,
  getEvent,
  organizationId,
} from '@racepilot/core';
import { readFileSync } from 'node:fs';
const config = {
  deploymentMode: 'community' as const,
  organizationId: '10000000-0000-4000-8000-000000000001',
};
const org = {
  id: organizationId(config.organizationId),
  slug: 'demo',
  name: 'Demo',
  status: 'active' as const,
  contactEmail: null,
  websiteUrl: null,
  timezone: 'UTC',
  locale: 'en',
  currency: 'EUR',
};
const foreignEventId = '20000000-0000-4000-8000-000000000022';
function deps(): ApiDeps {
  return {
    config,
    organizations: {
      getById: async () => org,
      update: async (_ctx, p) => ({ ...org, ...p }),
    },
    events: {
      listByOrganization: async () => [],
      getById: async () => null,
    },
    authenticator: {
      authenticate: async () => ({
        issuer: 'test',
        subject: 'user',
      }),
    },
    memberships: {
      resolvePermissions: async () =>
        new Set(['organization:read', 'organization:update', 'event:read']),
    },
  };
}
describe('admin organization routes', () => {
  it('bootstraps the configured Community tenant and ignores untrusted host/organization selectors', async () => {
    const response = await createApp(deps()).request(
      '/runtime/bootstrap?organizationId=foreign',
      {
        headers: {
          host: 'untrusted.example',
          'x-organization-id': '20000000-0000-4000-8000-000000000002',
        },
      },
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.organization.id).toBe(config.organizationId);
    expect(payload.deploymentMode).toBe('community');
    expect(payload.activeEvent).toBeNull();
  });
  it('derives bank transfer capability only from a valid configured recipient', async () => {
    const api = deps();
    api.runtimeBootstrap = {
      configurationVersion: '1',
      capabilities: ['mail.delivery'],
    };
    api.paymentRecipients = {
      get: async () => null,
      set: async (_ctx, value) => value,
    };
    let response = await createApp(api).request('/runtime/bootstrap');
    expect((await response.json()).capabilities).not.toContain(
      'payment.bank_transfer',
    );
    api.paymentRecipients = {
      get: async () => ({
        accountName: 'Race Club',
        iban: 'DE89370400440532013000',
        bic: null,
      }),
      set: async (_ctx, value) => value,
    };
    response = await createApp(api).request('/runtime/bootstrap');
    expect((await response.json()).capabilities).toEqual(
      expect.arrayContaining(['payment.bank_transfer', 'mail.delivery']),
    );
  });
  it('returns the neutral unavailable response for unknown or disabled installations', async () => {
    const api = deps();
    api.organizations = { ...api.organizations, getById: async () => null };
    const missing = await createApp(api).request('/runtime/bootstrap');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Runtime unavailable' });
    api.organizations = {
      ...api.organizations,
      getById: async () => ({ ...org, status: 'disabled' }),
    };
    const disabled = await createApp(api).request('/runtime/bootstrap');
    expect(disabled.status).toBe(404);
    expect(await disabled.json()).toEqual({ error: 'Runtime unavailable' });
  });
  it('uses the synthetic two-tenant fixture for cloud contexts and denies foreign IDs', async () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../../../docs/security/fixtures/two-tenant.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      organizations: {
        organizationId: string;
        slug: string;
        eventId: string;
      }[];
    };
    const [tenantA, tenantB] = fixture.organizations;
    const context = createRequestContext({
      deploymentMode: 'cloud',
      organizationId: organizationId(tenantA!.organizationId),
      permissions: new Set(['event:read', 'event:write']),
      capabilities: new Set(),
      correlationId: 'fixture',
    });
    const storedEvents = [
      { id: tenantA!.eventId, organizationId: tenantA!.organizationId },
      { id: tenantB!.eventId, organizationId: tenantB!.organizationId },
    ];
    const result = await getEvent(context, tenantB!.eventId, {
      events: {
        listByOrganization: async () => [],
        getById: async (ctx, id) => {
          const event = storedEvents.find(
            (candidate) =>
              candidate.id === id &&
              candidate.organizationId === ctx.organizationId,
          );
          return event
            ? {
                ...event,
                organizationId: organizationId(event.organizationId),
                slug: 'fixture',
                name: 'Fixture',
                startsOn: '2027-01-01',
                endsOn: '2027-01-02',
                status: 'draft',
                registrationOpensAt: null,
                registrationClosesAt: null,
                openedAt: null,
                closedAt: null,
                archivedAt: null,
              }
            : null;
        },
      },
    });
    expect(result).toBeNull();
  });
  it('returns 404 for a foreign event ID through the API', async () => {
    const api = deps();
    api.events = {
      listByOrganization: async () => [],
      getById: async (ctx, id) => {
        expect(ctx.organizationId).toBe(config.organizationId);
        expect(id).toBe(foreignEventId);
        return null;
      },
    };
    const response = await createApp(api).request(
      `/admin/events/${foreignEventId}`,
      {
        headers: {
          'X-Organization-Id': '20000000-0000-4000-8000-000000000002',
        },
      },
    );
    expect(response.status).toBe(404);
  });
  it('ignores client tenant and privilege values', async () => {
    const app = createApp(deps());
    const a = await app.request(
      '/admin/organization?organizationId=foreign&role=admin',
      {
        headers: {
          'X-Organization-Id': '20000000-0000-4000-8000-000000000002',
        },
      },
    );
    expect(await a.json()).toEqual(org);
    const b = await app.request('/admin/organization', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Changed',
        organizationId: '20000000-0000-4000-8000-000000000002',
        role: 'admin',
      }),
    });
    expect(b.status).toBe(400);
  });
  it('production-style default denies access', async () => {
    expect(
      (
        await createApp({
          config,
          organizations: deps().organizations,
          events: deps().events,
        }).request('/admin/organization')
      ).status,
    ).toBe(401);
  });
  it('fails closed when a verified identity has no active server-side membership', async () => {
    const api = deps();
    api.authenticator = {
      authenticate: async () =>
        ({
          issuer: 'test',
          subject: 'member',
          role: 'admin',
          permissions: ['*'],
        }) as never,
    };
    api.memberships = { resolvePermissions: async () => new Set() };
    expect((await createApp(api).request('/admin/organization')).status).toBe(
      403,
    );
  });
  it('does not leak config values', () => {
    expect(() => loadConfig({ DATABASE_URL: 'secret-value' })).toThrow(
      /DEPLOYMENT_MODE/,
    );
    expect(() => loadConfig({ DATABASE_URL: 'secret-value' })).not.toThrow(
      /secret-value/,
    );
  });
});

describe('registration administration and public endpoints', () => {
  it('reads defaults and records actor-scoped audited setting updates', async () => {
    const api = deps();
    let settings: RegistrationSettings = {
      sharedContactEmail: 'allowed',
      minimumAge: null,
      guardianRequiredBelowAge: 18,
      maximumClassesPerGroup: 8,
    };
    let actor = '';
    api.registrationSettings = {
      get: async () => settings,
      update: async (_context, next, by) => {
        settings = next;
        actor = by;
        return settings;
      },
    };
    const app = createApp(api);
    const get = await app.request('/admin/organization/registration-settings');
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      sharedContactEmail: 'allowed',
      guardianRequiredBelowAge: 18,
    });
    const update = await app.request(
      '/admin/organization/registration-settings',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sharedContactEmail: 'disallowed',
          minimumAge: 16,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 5,
        }),
      },
    );
    expect(update.status).toBe(200);
    expect(settings.sharedContactEmail).toBe('disallowed');
    expect(actor).toBe('test|user');
    expect(
      (
        await app.request('/admin/organization/registration-settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...settings, extra: true }),
        })
      ).status,
    ).toBe(400);
  });

  it('does not trust spoofed client forwarding headers for registration rate limits', async () => {
    const api = deps();
    api.publicRegistration = {
      getForm: async () => ({ event: { name: 'Demo' } }),
      submit: async () => ({ accepted: true }),
      verify: async () => false,
    };
    const observed: string[] = [];
    api.registrationRateLimiter = {
      consume: async (clientIdentity, scopes) => {
        observed.push(
          `${clientIdentity}:${scopes.map((scope) => scope.key).join(',')}`,
        );
        return { allowed: true, retryAfterMs: 0 };
      },
    };
    const app = createApp(api);
    const path = `/public/organizations/${config.organizationId}/events/event/registration/submissions`;
    for (const value of ['192.0.2.1', '198.51.100.2', '203.0.113.3']) {
      const response = await app.request(
        path,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'cf-connecting-ip': value,
            'x-real-ip': value,
            'x-forwarded-for': value,
          },
          body: JSON.stringify({
            submissionId: '10000000-0000-4000-8000-000000000099',
            formVersion: '1.0',
            language: 'en',
            eventSlug: 'event',
            person: {
              firstName: 'Test',
              lastName: 'Driver',
              email: 'test@example.test',
              dateOfBirth: '2000-01-01',
            },
            entries: [
              {
                classId: '20000000-0000-4000-8000-000000000099',
                vehicle: {
                  make: 'Maker',
                  model: 'Model',
                  year: 2020,
                  registration: null,
                },
              },
            ],
            consents: [
              {
                key: 'terms',
                version: 'v1',
                hash: 'a'.repeat(64),
                accepted: true,
              },
            ],
          }),
        },
        { incoming: { socket: { remoteAddress: '203.0.113.10' } } },
      );
      expect(response.status).toBe(202);
    }
    expect(observed).toEqual(
      Array(3).fill(
        `203.0.113.10:organization:${config.organizationId},event:${config.organizationId}:event`,
      ),
    );
  });

  it('uses forwarded identities only behind a configured trusted proxy', async () => {
    const api = deps();
    api.config = { ...config, TRUSTED_PROXIES: ['10.0.0.0/8'] };
    api.publicRegistration = {
      getForm: async () => ({ event: { name: 'Demo' } }),
      submit: async () => ({ accepted: true }),
      verify: async () => false,
    };
    const observed: string[] = [];
    api.registrationRateLimiter = {
      consume: async (clientIdentity) => {
        observed.push(clientIdentity);
        return { allowed: true, retryAfterMs: 0 };
      },
    };
    const app = createApp(api);
    await app.request(
      `/public/organizations/${config.organizationId}/events/event/registration/submissions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.99, 198.51.100.1, 10.0.0.2',
        },
        body: JSON.stringify({
          submissionId: '10000000-0000-4000-8000-000000000099',
          formVersion: '1.0',
          language: 'en',
          eventSlug: 'event',
          person: {
            firstName: 'Test',
            lastName: 'Driver',
            email: 'test@example.test',
            dateOfBirth: '2000-01-01',
          },
          entries: [
            {
              classId: '20000000-0000-4000-8000-000000000099',
              vehicle: {
                make: 'Maker',
                model: 'Model',
                year: 2020,
                registration: null,
              },
            },
          ],
          consents: [
            {
              key: 'terms',
              version: 'v1',
              hash: 'a'.repeat(64),
              accepted: true,
            },
          ],
        }),
      },
      { incoming: { socket: { remoteAddress: '10.0.0.8' } } },
    );
    expect(observed).toEqual(['198.51.100.1']);
  });

  it('fails closed without a connection identity and requires shared storage in Cloud', async () => {
    const api = deps();
    api.publicRegistration = {
      getForm: async () => ({ event: { name: 'Demo' } }),
      submit: async () => ({ accepted: true }),
      verify: async () => false,
    };
    api.registrationRateLimiter = createInMemoryRegistrationRateLimiter();
    const app = createApp(api);
    const response = await app.request(
      `/public/organizations/${config.organizationId}/events/event/registration/submissions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(response.status).toBe(503);

    api.config = { deploymentMode: 'cloud' };
    expect(() => createApp(api)).toThrow(
      /shared persistent rate-limit storage/,
    );
  });

  it('separates organization and event budgets across clients and tenants with retry guidance', async () => {
    let now = 1_000;
    const limiter = createInMemoryRegistrationRateLimiter({ now: () => now });
    const firstTenant = deps();
    firstTenant.config = {
      ...config,
      PUBLIC_REGISTRATION_ORG_LIMIT: 2,
      PUBLIC_REGISTRATION_EVENT_LIMIT: 1,
      PUBLIC_REGISTRATION_WINDOW_SECONDS: 60,
    };
    firstTenant.registrationRateLimiter = limiter;
    firstTenant.publicRegistration = {
      getForm: async () => ({ event: { name: 'Demo' } }),
      submit: async () => ({ accepted: true }),
      verify: async () => false,
    };
    const secondOrgId = '10000000-0000-4000-8000-000000000002';
    const secondTenant = {
      ...firstTenant,
      config: { ...firstTenant.config, organizationId: secondOrgId },
    };
    const firstApp = createApp(firstTenant);
    const secondApp = createApp(secondTenant);
    let submissionId = 0;
    const submit = (
      app: ReturnType<typeof createApp>,
      orgId: string,
      slug: string,
      remoteAddress: string,
    ) =>
      app.request(
        `/public/organizations/${orgId}/events/${slug}/registration/submissions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            submissionId: `10000000-0000-4000-8000-${String(++submissionId).padStart(12, '0')}`,
            formVersion: '1.0',
            language: 'en',
            eventSlug: slug,
            person: {
              firstName: 'Test',
              lastName: 'Driver',
              email: 'test@example.test',
              dateOfBirth: '2000-01-01',
            },
            entries: [
              {
                classId: '20000000-0000-4000-8000-000000000099',
                vehicle: {
                  make: 'Maker',
                  model: 'Model',
                  year: 2020,
                  registration: null,
                },
              },
            ],
            consents: [
              {
                key: 'terms',
                version: 'v1',
                hash: 'a'.repeat(64),
                accepted: true,
              },
            ],
          }),
        },
        { incoming: { socket: { remoteAddress } } },
      );
    const clientA = '192.0.2.1';
    const clientB = '192.0.2.2';
    expect(
      (await submit(firstApp, config.organizationId, 'event', clientA)).status,
    ).toBe(202);
    const eventBurst = await submit(
      firstApp,
      config.organizationId,
      'event',
      clientA,
    );
    expect(eventBurst.status).toBe(429);
    expect(eventBurst.headers.get('retry-after')).toBe('60');
    expect(
      (await submit(firstApp, config.organizationId, 'other', clientA)).status,
    ).toBe(202);
    expect(
      (await submit(firstApp, config.organizationId, 'third', clientA)).status,
    ).toBe(429);
    expect(
      (await submit(firstApp, config.organizationId, 'event', clientB)).status,
    ).toBe(202);
    expect(
      (await submit(secondApp, secondOrgId, 'event', clientA)).status,
    ).toBe(202);
    now += 60_001;
    expect(
      (await submit(firstApp, config.organizationId, 'event', clientA)).status,
    ).toBe(202);
  });

  it('uses generic public verification responses and rate-limits by IP and event', async () => {
    const api = deps();
    api.publicRegistration = {
      getForm: async () => ({ event: { name: 'Demo' } }),
      submit: async () => ({ accepted: true }),
      verify: async () => false,
    };
    api.registrationRateLimiter = {
      consume: async () => ({ allowed: true, retryAfterMs: 0 }),
    };
    const app = createApp(api);
    const form = await app.request(
      `/public/organizations/${config.organizationId}/events/event/registration/form`,
    );
    expect(form.status).toBe(200);
    expect((await form.json()).form.version).toBe('1.0');
    const registration = {
      submissionId: '10000000-0000-4000-8000-000000000099',
      formVersion: '1.0',
      language: 'en',
      eventSlug: 'event',
      person: {
        firstName: 'Test',
        lastName: 'Driver',
        email: 'test@example.test',
        dateOfBirth: '2000-01-01',
      },
      entries: [
        {
          classId: '20000000-0000-4000-8000-000000000099',
          vehicle: {
            make: 'Maker',
            model: 'Model',
            year: 2020,
            registration: null,
          },
        },
      ],
      consents: [
        { key: 'terms', version: 'v1', hash: 'a'.repeat(64), accepted: true },
      ],
    };
    const submitted = await app.request(
      `/public/organizations/${config.organizationId}/events/event/registration/submissions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(registration),
      },
      { incoming: { socket: { remoteAddress: '192.0.2.1' } } },
    );
    expect(submitted.status).toBe(202);
    expect(await submitted.json()).toEqual({ accepted: true });
    const invalid = await app.request('/public/registration/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-token' }),
    });
    expect(await invalid.json()).toEqual({ verified: false });
    const forbiddenTenant = await app.request(
      '/public/organizations/20000000-0000-4000-8000-000000000001/events/event/registration/form',
    );
    expect(forbiddenTenant.status).toBe(404);
    const invalidPayload = await app.request(
      `/public/organizations/${config.organizationId}/events/event/registration/submissions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unexpected: true }),
      },
      { incoming: { socket: { remoteAddress: '192.0.2.1' } } },
    );
    expect(invalidPayload.status, await invalidPayload.clone().text()).toBe(
      400,
    );
    let now = 1000;
    const limiter = createInMemoryRegistrationRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => now,
    });
    const scopes = [
      { key: 'organization:org', limit: 2, windowMs: 100 },
      { key: 'event:org:event', limit: 1, windowMs: 100 },
    ];
    expect((await limiter.consume('192.0.2.5', scopes)).allowed).toBe(true);
    expect((await limiter.consume('192.0.2.5', scopes)).allowed).toBe(false);
    expect(
      (
        await limiter.consume('192.0.2.5', [
          scopes[0]!,
          { ...scopes[1]!, key: 'event:org:other' },
        ])
      ).allowed,
    ).toBe(true);
    now += 101;
    expect((await limiter.consume('192.0.2.5', scopes)).allowed).toBe(true);
  });

  it('requires event:write to change versioned event consent text and rejects wrong hashes', async () => {
    const api = deps();
    api.memberships = {
      resolvePermissions: async () => new Set(['event:read', 'event:write']),
    };
    const records: string[] = [];
    api.eventConsents = {
      get: async () => [],
      update: async (_context, _eventId, terms, actor) => {
        records.push(`${terms.length}:${actor}`);
        return terms;
      },
    };
    const hash = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256').update('Terms').digest('hex'),
    );
    const app = createApp(api);
    const good = await app.request(`/admin/events/${foreignEventId}/consents`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        terms: [
          {
            key: 'terms',
            version: '2026-1',
            language: 'en',
            text: 'Terms',
            hash,
          },
        ],
      }),
    });
    expect(good.status).toBe(200);
    expect(records[0]).toContain('test|user');
    const bad = await app.request(`/admin/events/${foreignEventId}/consents`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        terms: [
          {
            key: 'terms',
            version: '2026-1',
            language: 'en',
            text: 'Terms',
            hash: '0'.repeat(64),
          },
        ],
      }),
    });
    expect(bad.status).toBe(400);
  });
});

describe('registration workflow admin routes', () => {
  it('validates, authorizes and scopes organization and event workflow revisions', async () => {
    const { defaultEntryWorkflow } = await import('@racepilot/core');
    const stored = {
      id: 'rev1',
      organizationId: organizationId(config.organizationId),
      eventId: null,
      version: 1,
      workflow: defaultEntryWorkflow,
    };
    const api = deps();
    api.memberships = {
      resolvePermissions: async () =>
        new Set([
          'organization:read',
          'organization:update',
          'event:read',
          'event:write',
        ]),
    };
    const calls: string[] = [];
    api.entryWorkflows = {
      getPinnedForEntry: async () => stored,
      getOrganization: async () => stored,
      getEffective: async (_ctx, eventId) =>
        eventId === foreignEventId
          ? null
          : { ...stored, eventId, workflow: stored.workflow },
      setOrganization: async (_ctx, workflow, actor, reason) => {
        calls.push(`org:${actor}:${reason}`);
        return { ...stored, workflow, version: 2 };
      },
      setEvent: async (_ctx, eventId, workflow, actor, reason) => {
        if (eventId === foreignEventId) return null;
        calls.push(`event:${eventId}:${actor}:${reason}`);
        return { ...stored, eventId, workflow, version: 2 };
      },
    };
    const app = createApp(api);
    let response = await app.request(
      '/admin/organization/registration-workflow',
    );
    expect(response.status).toBe(200);
    response = await app.request('/admin/organization/registration-workflow', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workflow: stored.workflow,
        reason: 'Policy update',
      }),
    });
    expect(response.status).toBe(200);
    expect(calls[0]).toContain('org:test|user:Policy update');
    response = await app.request(
      `/admin/events/${foreignEventId}/registration-workflow`,
    );
    expect(response.status).toBe(404);
    response = await app.request(
      `/admin/events/${foreignEventId}/registration-workflow`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflow: stored.workflow,
          reason: 'Event override',
        }),
      },
    );
    expect(response.status).toBe(404);
    response = await app.request('/admin/organization/registration-workflow', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workflow: { ...stored.workflow, transitions: [] },
        reason: 'bad',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('requires explicit workflow permissions', async () => {
    const api = deps();
    api.entryWorkflows = {
      getOrganization: async () => null,
      getPinnedForEntry: async () => null,
      getEffective: async () => null,
      setOrganization: async () => {
        throw new Error('unexpected');
      },
      setEvent: async () => null,
    };
    api.memberships = {
      resolvePermissions: async () => new Set(['event:read']),
    };
    expect(
      (
        await createApp(api).request(
          '/admin/organization/registration-workflow',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createApp(api).request(
          '/admin/organization/registration-workflow',
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          },
        )
      ).status,
    ).toBe(403);
  });
});
