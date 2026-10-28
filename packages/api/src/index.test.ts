import { describe, expect, it } from 'vitest';
import {
  createApp,
  deploymentModeFromConfig,
  health,
  loadConfig,
} from './index.js';

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
});
