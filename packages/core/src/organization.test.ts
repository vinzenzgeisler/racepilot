import { describe, it, expect } from 'vitest';
import {
  createRequestContext,
  organizationId,
  getOrganization,
  updateOrganization,
} from './index.js';
const ctx = (permissions: string[]) =>
  createRequestContext({
    deploymentMode: 'community',
    organizationId: organizationId('10000000-0000-4000-8000-000000000001'),
    permissions: new Set(permissions),
    capabilities: new Set(),
    correlationId: 'test',
  });
const org = {
  id: organizationId('10000000-0000-4000-8000-000000000001'),
  slug: 'demo',
  name: 'Demo',
  status: 'active' as const,
  contactEmail: null,
  websiteUrl: null,
  timezone: 'UTC',
  locale: 'en',
  currency: 'EUR',
};
describe('organization use cases', () => {
  it('requires read permission', async () => {
    await expect(
      getOrganization(ctx([]), {
        organizations: { getById: async () => org, update: async () => org },
      }),
    ).rejects.toThrow('Forbidden');
  });
  it('validates updates and requires permission', async () => {
    const deps = {
      organizations: {
        getById: async () => org,
        update: async (
          _c: import('./index.js').RequestContext,
          p: import('./index.js').OrganizationPatch,
        ) => ({ ...org, ...p }),
      },
    };
    await expect(
      updateOrganization(
        ctx(['organization:update']),
        { timezone: 'Mars/Olympus' },
        deps,
      ),
    ).rejects.toThrow('Invalid timezone');
    await expect(
      updateOrganization(ctx([]), { name: 'ok' }, deps),
    ).rejects.toThrow('Forbidden');
  });
});
