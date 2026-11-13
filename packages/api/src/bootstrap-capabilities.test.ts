import { describe, expect, it } from 'vitest';
import { createRequestContext, organizationId } from '@racepilot/core';
import { createApp } from './index.js';
import { testDeps } from './testing.js';

const tenants = {
  a: '10000000-0000-4000-8000-00000000000a',
  b: '10000000-0000-4000-8000-00000000000b',
};
const organization = (id: string) => ({
  id: organizationId(id),
  slug: id.slice(-1),
  name: `Org ${id.slice(-1)}`,
  status: 'active' as const,
  contactEmail: null,
  websiteUrl: null,
  timezone: 'UTC',
  locale: 'en',
  currency: 'EUR',
});
const resolve = async (request: Request) => {
  const id = request.headers.get('x-test-tenant');
  return id
    ? createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(id),
        permissions: new Set(),
        capabilities: new Set(),
        correlationId: 'test',
      })
    : null;
};

describe('organization capabilities in the runtime bootstrap', () => {
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'cloud' },
      contextResolvers: { public: resolve, member: resolve },
      organizations: {
        getById: async (ctx) => organization(ctx.organizationId),
        update: async () => null,
      },
      events: { listByOrganization: async () => [], getById: async () => null },
      organizationCapabilities: async (tenant) =>
        tenant.organizationId === tenants.a ? ['mail.delivery'] : [],
    }),
  );
  const capabilities = async (tenant: string) =>
    (
      await (
        await app.request('/runtime/bootstrap', {
          headers: { 'x-test-tenant': tenant },
        })
      ).json()
    ).capabilities;

  it('resolves mail.delivery per organization on every request', async () => {
    expect(await capabilities(tenants.a)).toContain('mail.delivery');
    expect(await capabilities(tenants.b)).not.toContain('mail.delivery');
    expect(await capabilities(tenants.a)).toContain('mail.delivery');
  });
});
