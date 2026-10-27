import { describe, it, expect } from 'vitest';
import { createApp, loadConfig, type ApiDeps } from './index.js';
import { organizationId } from '@racepilot/core';
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
function deps(): ApiDeps {
  return {
    config,
    organizations: {
      getById: async () => org,
      update: async (_ctx, p) => ({ ...org, ...p }),
    },
    authenticator: {
      authenticate: async () => ({
        issuer: 'test',
        subject: 'user',
        permissions: new Set(['organization:read', 'organization:update']),
      }),
    },
  };
}
describe('admin organization routes', () => {
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
