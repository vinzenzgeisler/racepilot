import { describe, it, expect } from 'vitest';
import { createApp, loadConfig, type ApiDeps } from './index.js';
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
        permissions: new Set([
          'organization:read',
          'organization:update',
          'event:read',
        ]),
      }),
    },
  };
}
describe('admin organization routes', () => {
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
      permissions: new Set(['event:read']),
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
  it('does not leak config values', () => {
    expect(() => loadConfig({ DATABASE_URL: 'secret-value' })).toThrow(
      /DEPLOYMENT_MODE/,
    );
    expect(() => loadConfig({ DATABASE_URL: 'secret-value' })).not.toThrow(
      /secret-value/,
    );
  });
});
