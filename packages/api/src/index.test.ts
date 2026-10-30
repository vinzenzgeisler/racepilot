import { describe, expect, it } from 'vitest';
import {
  createApp,
  deploymentModeFromConfig,
  health,
  loadConfig,
} from './index.js';
import {
  createRequestContext,
  organizationId,
  defaultEntryWorkflow,
  defaultEntryStatusDimensionConfig,
} from '@racepilot/core';

describe('api entry', () => {
  it('returns a contract-validated health response', () =>
    expect(health('1.0')).toEqual({ status: 'ok', version: '1.0' }));
  it('fixes the deployment mode from server configuration', () =>
    expect(deploymentModeFromConfig('community')).toBe('community'));
  it('fails closed on an unknown deployment mode', () =>
    expect(() => deploymentModeFromConfig('unknown')).toThrow());
  it('disables optional provider capabilities by default', () => {
    const config = loadConfig({
      DEPLOYMENT_MODE: 'community',
      DATABASE_URL: 'postgres://localhost/racepilot',
      COMMUNITY_ORGANIZATION_SLUG: 'club',
      COMMUNITY_ORGANIZATION_NAME: 'Club',
      COMMUNITY_ORGANIZATION_TIMEZONE: 'Europe/Berlin',
      COMMUNITY_ORGANIZATION_LOCALE: 'de',
    });
    expect(config.mailEnabled).toBe(false);
    expect(config.storageEnabled).toBe(false);
    expect(config.TRUSTED_PROXIES).toEqual([]);
    expect(config.PUBLIC_REGISTRATION_ORG_LIMIT).toBe(60);
    expect(config.PUBLIC_REGISTRATION_EVENT_LIMIT).toBe(8);
    expect(config.PUBLIC_REGISTRATION_WINDOW_SECONDS).toBe(60);
  });
  it('validates trusted proxy CIDRs and configurable public rate limits', () => {
    const base = {
      DEPLOYMENT_MODE: 'community',
      DATABASE_URL: 'postgres://localhost/racepilot',
      COMMUNITY_ORGANIZATION_SLUG: 'club',
      COMMUNITY_ORGANIZATION_NAME: 'Club',
      COMMUNITY_ORGANIZATION_TIMEZONE: 'UTC',
      COMMUNITY_ORGANIZATION_LOCALE: 'en',
    };
    const config = loadConfig({
      ...base,
      TRUSTED_PROXIES: '10.0.0.0/8, 192.0.2.10',
      PUBLIC_REGISTRATION_ORG_LIMIT: '90',
      PUBLIC_REGISTRATION_EVENT_LIMIT: '12',
      PUBLIC_REGISTRATION_WINDOW_SECONDS: '30',
    });
    expect(config.TRUSTED_PROXIES).toEqual(['10.0.0.0/8', '192.0.2.10']);
    expect(config.PUBLIC_REGISTRATION_ORG_LIMIT).toBe(90);
    expect(config.PUBLIC_REGISTRATION_EVENT_LIMIT).toBe(12);
    expect(config.PUBLIC_REGISTRATION_WINDOW_SECONDS).toBe(30);
    expect(() =>
      loadConfig({ ...base, TRUSTED_PROXIES: 'not a proxy CIDR' }),
    ).toThrow(/TRUSTED_PROXIES/);
    expect(() =>
      loadConfig({ ...base, PUBLIC_REGISTRATION_EVENT_LIMIT: '0' }),
    ).toThrow(/PUBLIC_REGISTRATION_EVENT_LIMIT/);
  });
  it('fails closed when mail lacks a canonical base URL', () => {
    const config = loadConfig({
      DEPLOYMENT_MODE: 'community',
      DATABASE_URL: 'postgres://localhost/racepilot',
      COMMUNITY_ORGANIZATION_SLUG: 'club',
      COMMUNITY_ORGANIZATION_NAME: 'Club',
      COMMUNITY_ORGANIZATION_TIMEZONE: 'UTC',
      COMMUNITY_ORGANIZATION_LOCALE: 'en',
      MAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_FROM: 'noreply@example.test',
    });
    expect(config.mailEnabled).toBe(false);
    expect(
      loadConfig({
        DEPLOYMENT_MODE: 'community',
        DATABASE_URL: 'postgres://localhost/racepilot',
        COMMUNITY_ORGANIZATION_SLUG: 'club',
        COMMUNITY_ORGANIZATION_NAME: 'Club',
        COMMUNITY_ORGANIZATION_TIMEZONE: 'UTC',
        COMMUNITY_ORGANIZATION_LOCALE: 'en',
        MAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_FROM: 'noreply@example.test',
        CANONICAL_BASE_URL: 'https://race.example.test',
      }).mailEnabled,
    ).toBe(true);
  });
  it('fails closed on incomplete enabled providers without echoing secrets', () => {
    expect(() =>
      loadConfig({
        DEPLOYMENT_MODE: 'community',
        DATABASE_URL: 'postgres://localhost/racepilot',
        COMMUNITY_ORGANIZATION_SLUG: 'club',
        COMMUNITY_ORGANIZATION_NAME: 'Club',
        COMMUNITY_ORGANIZATION_TIMEZONE: 'Europe/Berlin',
        COMMUNITY_ORGANIZATION_LOCALE: 'de',
        MAIL_PROVIDER: 'smtp',
        SMTP_PASSWORD: 'do-not-print',
      }),
    ).toThrow(/SMTP_HOST/);
    try {
      loadConfig({});
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print');
    }
  });
  it('requires complete OIDC client and explicit bootstrap identity configuration', () => {
    expect(() =>
      loadConfig({
        DEPLOYMENT_MODE: 'community',
        DATABASE_URL: 'postgres://localhost/racepilot',
        COMMUNITY_ORGANIZATION_SLUG: 'club',
        COMMUNITY_ORGANIZATION_NAME: 'Club',
        COMMUNITY_ORGANIZATION_TIMEZONE: 'UTC',
        COMMUNITY_ORGANIZATION_LOCALE: 'en',
        OIDC_PROVIDER: 'oidc',
      }),
    ).toThrow(/OIDC_ISSUER_URL/);
  });
  it('exposes only the public OIDC web-client settings', async () => {
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: 'org' },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      oidcClient: {
        issuerUrl: 'https://id.example',
        clientId: 'racepilot-web',
        redirectUri: 'https://app.example/callback',
      },
    });
    expect(await (await app.request('/auth/config')).json()).toEqual({
      oidc: {
        issuerUrl: 'https://id.example',
        clientId: 'racepilot-web',
        redirectUri: 'https://app.example/callback',
      },
    });
  });
  it('composes trusted routes with a server-resolved cloud request context', async () => {
    const organization = organizationId('10000000-0000-4000-8000-000000000001');
    let sideEffects = 0;
    const memberContext = createRequestContext({
      deploymentMode: 'cloud',
      organizationId: organization,
      subject: { issuer: 'https://id.example', subject: 'operator-a' },
      permissions: new Set(['private-example:run']),
      capabilities: new Set(['private-example']),
      correlationId: 'cloud-test',
    });
    const app = createApp({
      config: { deploymentMode: 'cloud' },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      contextResolvers: {
        public: async () =>
          createRequestContext({
            deploymentMode: 'cloud',
            organizationId: organization,
            permissions: new Set(),
            capabilities: new Set(['private-example']),
            correlationId: 'cloud-public-test',
          }),
        member: async (request) =>
          request.headers.get('authorization') === 'Bearer operator-a'
            ? memberContext
            : null,
      },
      mountAdditionalRoutes: (routes, contexts) => {
        routes.post('/composition/action', async (context) => {
          const resolved = await contexts.member(context.req.raw);
          if (!resolved) return context.json({ error: 'Unauthorized' }, 401);
          if (
            !resolved.permissions.has('private-example:run') ||
            !resolved.capabilities.has('private-example')
          )
            return context.json({ error: 'Forbidden' }, 403);
          sideEffects += 1;
          return context.json({ organizationId: resolved.organizationId });
        });
      },
    });

    const denied = await app.request('/composition/action', { method: 'POST' });
    expect(denied.status).toBe(401);
    expect(sideEffects).toBe(0);
    const allowed = await app.request('/composition/action', {
      method: 'POST',
      headers: { authorization: 'Bearer operator-a' },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ organizationId: organization });
    expect(sideEffects).toBe(1);
  });
  it('does not resolve a public event using a caller-supplied foreign organization', async () => {
    const configuredOrg = '11111111-1111-4111-8111-111111111111';
    const foreignOrg = '22222222-2222-4222-8222-222222222222';
    const seen: string[] = [];
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: configuredOrg },
      organizations: { getById: async () => null, update: async () => null },
      events: {
        listByOrganization: async () => [],
        getById: async () => null,
        getPublicBySlug: async (ctx) => {
          seen.push(ctx.organizationId);
          return null;
        },
      },
    });
    expect(
      (await app.request(`/public/events/${foreignOrg}/anything`)).status,
    ).toBe(404);
    expect(seen).toEqual([]);
    expect(
      (await app.request(`/public/events/${configuredOrg}/anything`)).status,
    ).toBe(404);
    expect(seen).toEqual([configuredOrg]);
  });
  it('returns 404 for a foreign entry ID', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    let transitions = 0;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'admin',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['entry:read', 'entry:write']),
      },
      entries: {
        getById: async () => null,
        transition: async () => {
          transitions += 1;
          return null;
        },
        softDelete: async () => null,
      },
    });
    expect(
      (await app.request('/admin/entries/22222222-2222-4222-8222-222222222222'))
        .status,
    ).toBe(404);
    expect(
      (
        await app.request(
          '/admin/entries/22222222-2222-4222-8222-222222222222/transitions',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              transition: 'verification',
              status: 'verified',
              reason: 'checked',
            }),
          },
        )
      ).status,
    ).toBe(404);
    // does not transition a foreign entry ID; the repository receives server-resolved organization context.
    expect(transitions).toBe(0);
  });
  it('requires entry:read for the paginated admin list', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    let called = false;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'member',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['payment:read']),
      },
      entries: {
        getById: async () => null,
        listAdmin: async () => {
          called = true;
          return { items: [], total: 0 };
        },
        transition: async () => null,
        softDelete: async () => null,
      },
    });
    expect((await app.request('/admin/entries?page=1')).status).toBe(403);
    expect(called).toBe(false);
  });
  it('requires entry:read before looking up an admin entry detail', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    let lookedUp = false;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'member',
        }),
      },
      memberships: { resolvePermissions: async () => new Set(['event:read']) },
      entries: {
        getById: async () => {
          lookedUp = true;
          return null;
        },
        transition: async () => null,
        softDelete: async () => null,
      },
    });
    expect(
      (await app.request('/admin/entries/22222222-2222-4222-8222-222222222222'))
        .status,
    ).toBe(403);
    expect(lookedUp).toBe(false);
  });
  it('passes only validated list filters with the server-resolved tenant context', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    let seen: { organizationId: string; query?: unknown } | undefined;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'admin',
        }),
      },
      memberships: { resolvePermissions: async () => new Set(['entry:read']) },
      entries: {
        getById: async () => null,
        listAdmin: async (ctx, query) => {
          seen = { organizationId: ctx.organizationId, query };
          return { items: [], total: 0 };
        },
        transition: async () => null,
        softDelete: async () => null,
      },
    });
    const response = await app.request(
      '/admin/entries?page=2&pageSize=10&acceptanceStatus=pending&sort=createdAt&direction=asc',
    );
    expect(response.status).toBe(200);
    expect(seen).toEqual({
      organizationId: org,
      query: expect.objectContaining({
        page: 2,
        pageSize: 10,
        acceptanceStatus: 'pending',
        direction: 'asc',
      }),
    });
    expect(await response.json()).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
    expect((await app.request('/admin/entries?pageSize=1000')).status).toBe(
      400,
    );
  });
  it('returns the unchanged entry transition response without a registration form', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    const transitioned = { id: 'entry-1', verificationStatus: 'verified' };
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'admin',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['entry:read', 'entry:write']),
      },
      entries: {
        getById: async () =>
          ({
            id: 'entry-1',
            verificationStatus: 'unverified',
            acceptanceStatus: 'pending',
          }) as never,
        transition: async () => transitioned as never,
        softDelete: async () => null,
      },
    });
    const response = await app.request('/admin/entries/entry-1/transitions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        transition: 'verification',
        status: 'verified',
        reason: 'checked',
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(transitioned);
  });

  it('transitions acceptance through the entry pinned workflow revision', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    const workflow = {
      ...defaultEntryWorkflow,
      statuses: [
        ...defaultEntryWorkflow.statuses,
        {
          key: 'documents_missing',
          labels: { de: 'Unterlagen fehlen', en: 'Documents missing' },
          color: '#ca8a04',
          category: 'pending' as const,
        },
      ],
      transitions: [
        ...defaultEntryWorkflow.transitions,
        { from: 'pending', to: 'documents_missing', reasonRequired: true },
      ],
    };
    const revision = {
      id: 'revision-2',
      organizationId: organizationId(org),
      eventId: 'event-1',
      version: 2,
      workflow,
    };
    let received: unknown;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'admin',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['entry:read', 'entry:write']),
      },
      entries: {
        getById: async () =>
          ({
            id: 'entry-1',
            verificationStatus: 'unverified',
            acceptanceStatus: 'pending',
          }) as never,
        transition: async (...args: unknown[]) => {
          received = args;
          return {
            id: 'entry-1',
            acceptanceStatus: 'documents_missing',
          } as never;
        },
        softDelete: async () => null,
      },
      entryWorkflows: {
        getOrganization: async () => null,
        getEffective: async () => revision,
        getPinnedForEntry: async (_ctx, entryId) =>
          entryId === 'entry-1' ? revision : null,
        setOrganization: async () => revision,
        setEvent: async () => revision,
      },
    });
    const request = (reason?: string, status = 'documents_missing') =>
      app.request('/admin/entries/entry-1/transitions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transition: 'acceptance',
          status,
          ...(reason === undefined ? {} : { reason }),
        }),
      });
    expect((await request()).status).toBe(403);
    expect((await request('')).status).toBe(403);
    const optionalReason = await app.request(
      '/admin/entries/entry-1/transitions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transition: 'acceptance', status: 'accepted' }),
      },
    );
    expect(optionalReason.status).toBe(200);
    expect((received as unknown[])[6]).toBe('');
    expect((await request('not allowed', 'pending')).status).toBe(403);
    const response = await request('request documents');
    expect(response.status).toBe(200);
    expect(received).toEqual([
      expect.objectContaining({ organizationId: organizationId(org) }),
      'entry-1',
      'acceptance',
      'pending',
      'documents_missing',
      'https://id.example#admin',
      'request documents',
      { statusCategory: 'pending', workflowRevisionId: 'revision-2' },
    ]);
  });

  it('requires payment:write for admin payment intake', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    let called = false;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'member',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['payment:read']),
      },
      payments: {
        record: async () => {
          called = true;
          return { id: 'p' };
        },
        correct: async () => null,
      },
    });
    const response = await app.request(
      '/admin/invoices/22222222-2222-4222-8222-222222222222/payments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountCents: 100, reason: 'bank transfer' }),
      },
    );
    expect(response.status).toBe(403);
    expect(called).toBe(false);
  });

  it('requires event:write for price-rule administration', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    let called = false;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'member',
        }),
      },
      memberships: { resolvePermissions: async () => new Set(['event:read']) },
      pricing: {
        listByEvent: async () => [],
        upsert: async (_ctx, _event, rule) => {
          called = true;
          return rule;
        },
      },
    });
    const response = await app.request(
      '/admin/events/22222222-2222-4222-8222-222222222222/pricing/33333333-3333-4333-8333-333333333333',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseCents: 1000,
          additionalEntryAdjustmentCents: 0,
          earlyBirdDeadline: null,
          earlyBirdDiscountCents: 0,
        }),
      },
    );
    expect(response.status).toBe(403);
    expect(called).toBe(false);
  });

  it('manages event status dimensions only with validated server-scoped requests', async () => {
    const org = organizationId('11111111-1111-4111-8111-111111111111');
    let stored: unknown;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'admin',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['event:read', 'event:write']),
      },
      entryStatusDimensions: {
        getEvent: async (ctx, eventId) => {
          expect(ctx.organizationId).toBe(org);
          expect(eventId).toBe('event-1');
          return defaultEntryStatusDimensionConfig;
        },
        setEvent: async (ctx, eventId, config, actor, reason) => {
          expect(ctx.organizationId).toBe(org);
          expect(eventId).toBe('event-1');
          expect(actor).toBe('https://id.example|admin');
          expect(reason).toBe('event setup');
          stored = config;
          return config;
        },
        transition: async () => true,
        updateHints: async () => true,
      },
    });
    expect(
      (await app.request('/admin/events/event-1/status-dimensions')).status,
    ).toBe(200);
    const response = await app.request(
      '/admin/events/event-1/status-dimensions',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          config: defaultEntryStatusDimensionConfig,
          reason: 'event setup',
          organizationId: '22222222-2222-4222-8222-222222222222',
        }),
      },
    );
    expect(response.status).toBe(400);
    const valid = await app.request('/admin/events/event-1/status-dimensions', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        config: defaultEntryStatusDimensionConfig,
        reason: 'event setup',
      }),
    });
    expect(valid.status).toBe(200);
    expect(stored).toEqual(defaultEntryStatusDimensionConfig);
  });
});

describe('event CSV export', () => {
  it('requires entry:read for CSV export', async () => {
    const app = createApp({
      config: {
        deploymentMode: 'community',
        organizationId: '11111111-1111-4111-8111-111111111111',
      },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'viewer',
        }),
      },
      memberships: { resolvePermissions: async () => new Set(['event:read']) },
      entryExports: { listByEvent: async () => [] },
    });
    expect(
      (
        await app.request(
          '/admin/events/22222222-2222-4222-8222-222222222222/entries.csv',
        )
      ).status,
    ).toBe(403);
  });
  it('queues CSV exports with allow-listed fields and a stable idempotency key', async () => {
    const orgId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    let enqueued = 0;
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: orgId },
      organizations: { getById: async () => null, update: async () => null },
      events: {
        listByOrganization: async () => [],
        getById: async () => ({
          id: eventId,
          organizationId: orgId as never,
          slug: 'race',
          name: 'Race',
          startsOn: '2026-05-01',
          endsOn: '2026-05-01',
          status: 'open',
          registrationOpensAt: null,
          registrationClosesAt: null,
          openedAt: null,
          closedAt: null,
          archivedAt: null,
        }),
      },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'viewer',
        }),
      },
      memberships: { resolvePermissions: async () => new Set(['entry:read']) },
      entryExports: {
        listByEvent: async () => {
          throw new Error('CSV must be generated in the worker');
        },
      },
      artifactJobs: {
        enqueue: async (_ctx, input) => {
          enqueued++;
          return {
            id: '33333333-3333-4333-8333-333333333333',
            organizationId: orgId as never,
            eventId,
            kind: input.kind,
            registrationGroupId: null,
            fields: input.fields ?? [],
            idempotencyKey: input.idempotencyKey,
            status: 'queued',
            objectId: null,
            sha256: null,
            contentType: null,
            attempts: 0,
            error: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          };
        },
        getById: async () => null,
        claim: async () => null,
        release: async () => {},
        complete: async () => {},
        fail: async () => {},
      },
      objectStorage: {
        put: async () => {
          throw new Error('Must not store in request');
        },
        get: async () => null,
        delete: async () => {},
      },
    });
    const url = `/admin/events/${eventId}/entries.csv?fields=driver,status`;
    expect((await app.request(url)).status).toBe(400);
    expect(
      (
        await app.request(
          `/admin/events/${eventId}/entries.csv?fields=secret`,
          { headers: { 'Idempotency-Key': 'csv-key' } },
        )
      ).status,
    ).toBe(400);
    const response = await app.request(url, {
      headers: { 'Idempotency-Key': 'csv-key' },
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ status: 'queued' });
    expect(enqueued).toBe(1);
  });
});

describe('entry confirmation artifact routes', () => {
  it('queues and downloads only tenant-owned artifacts after permission and scoped group lookup', async () => {
    const orgId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    const groupId = '33333333-3333-4333-8333-333333333333';
    const docId = '44444444-4444-4444-8444-444444444444';
    const objectId = '55555555-5555-4555-8555-555555555555';
    let groupLookups = 0;
    const pdf = new TextEncoder().encode('%PDF synthetic');
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: orgId },
      organizations: {
        getById: async () => ({
          id: orgId as never,
          slug: 'fixture',
          name: 'Tenant A Club',
          status: 'active',
          contactEmail: null,
          websiteUrl: null,
          timezone: 'UTC',
          locale: 'en',
          currency: 'EUR',
        }),
        update: async () => null,
      },
      events: {
        listByOrganization: async () => [],
        getById: async (_ctx, id) =>
          id === eventId
            ? {
                id,
                organizationId: orgId as never,
                slug: 'race',
                name: 'Tenant A Event',
                startsOn: '2026-05-01',
                endsOn: '2026-05-01',
                status: 'open',
                registrationOpensAt: null,
                registrationClosesAt: null,
                openedAt: null,
                closedAt: null,
                archivedAt: null,
              }
            : null,
      },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://issuer.example',
          subject: 'admin-a',
        }),
      },
      memberships: { resolvePermissions: async () => new Set(['entry:read']) },
      entryConfirmations: {
        getByGroup: async (_ctx, event, group) => {
          groupLookups++;
          return event === eventId && group === groupId
            ? {
                eventId,
                eventName: 'Tenant A Event',
                eventStartsOn: '2026-05-01',
                registrationGroupId: groupId,
                driverName: 'Driver A',
                vehicles: ['A Car'],
                classes: ['A Class'],
                priceSnapshot: {
                  version: '1',
                  currency: 'EUR',
                  calculatedAt: '2026-01-01T00:00:00.000Z',
                  totalCents: 1000,
                  lines: [],
                },
                paymentReference: 'RP-1',
              }
            : null;
        },
      },
      artifactJobs: {
        enqueue: async (_ctx, input) => ({
          id: docId,
          organizationId: orgId as never,
          eventId,
          kind: input.kind,
          registrationGroupId: groupId,
          fields: [],
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          objectId: null,
          sha256: null,
          contentType: null,
          attempts: 0,
          error: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        getById: async (_ctx, id) =>
          id === docId
            ? {
                id: docId,
                organizationId: orgId as never,
                eventId,
                kind: 'confirmation_pdf',
                registrationGroupId: groupId,
                fields: [],
                idempotencyKey: 'key',
                status: 'ready',
                objectId,
                sha256: 'a'.repeat(64),
                contentType: 'application/pdf',
                attempts: 1,
                error: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              }
            : null,
        claim: async () => null,
        release: async () => {},
        complete: async () => {},
        fail: async () => {},
      },
      objectStorage: {
        put: async () => ({
          organizationId: orgId as never,
          objectId,
          contentType: 'application/pdf',
          size: pdf.length,
          sha256: 'a'.repeat(64),
        }),
        get: async (owner, id) =>
          owner === orgId && id === objectId
            ? {
                ref: {
                  organizationId: orgId as never,
                  objectId,
                  contentType: 'application/pdf',
                  size: pdf.length,
                  sha256: 'a'.repeat(64),
                },
                body: pdf,
              }
            : null,
        delete: async () => {},
      },
    });
    const created = await app.request(
      `/admin/events/${eventId}/registration-groups/${groupId}/confirmation`,
      { method: 'POST', headers: { 'Idempotency-Key': 'pdf-key' } },
    );
    expect(created.status).toBe(202);
    expect(await created.json()).toEqual({ jobId: docId, status: 'queued' });
    const download = await app.request(`/admin/artifact-jobs/${docId}`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('application/pdf');
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(pdf);
    expect(
      (
        await app.request(
          `/admin/events/${eventId}/registration-groups/66666666-6666-4666-8666-666666666666/confirmation`,
          { method: 'POST', headers: { 'Idempotency-Key': 'foreign-key' } },
        )
      ).status,
    ).toBe(404);
    expect(groupLookups).toBe(2);
  });
});
