import { describe, it, expect } from 'vitest';
import { parseJobEnvelope, createJobContext } from './index.js';
const base = {
  type: 'demo',
  schemaVersion: 1,
  organizationId: '10000000-0000-4000-8000-000000000001',
  payload: {},
  correlationId: 'corr',
};
describe('job tenant context', () => {
  it('rejects unknown schema version', () =>
    expect(() => parseJobEnvelope({ ...base, schemaVersion: 2 })).toThrow());
  it('rejects missing, unknown, and disabled organizations', async () => {
    const envelope = parseJobEnvelope(base);
    for (const value of [null, { status: 'disabled' }])
      await expect(
        createJobContext(envelope, {
          deploymentMode: 'cloud',
          jobId: 'job',
          getOrganization: async () => value,
        }),
      ).rejects.toThrow();
  });
  it('creates context for an active organization', async () => {
    const ctx = await createJobContext(parseJobEnvelope(base), {
      deploymentMode: 'cloud',
      jobId: 'job',
      getOrganization: async () => ({ status: 'active' }),
    });
    expect(ctx.organizationId).toBe(base.organizationId);
  });
  it('rejects a foreign organization in community even when it is active', async () => {
    await expect(
      createJobContext(parseJobEnvelope(base), {
        deploymentMode: 'community',
        communityOrganizationId: '20000000-0000-4000-8000-000000000002',
        jobId: 'job',
        getOrganization: async () => ({ status: 'active' }),
      }),
    ).rejects.toThrow('Organization unavailable');
  });
});
