import { describe, expect, it } from 'vitest';
import { createArtifactTask } from './artifacts.js';

const org = '11111111-1111-4111-8111-111111111111';
const event = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const job = {
  id,
  organizationId: org as never,
  eventId: event,
  kind: 'entries_csv' as const,
  registrationGroupId: null,
  fields: ['driver', 'status'],
  idempotencyKey: 'csv-key',
  status: 'queued' as const,
  objectId: null,
  sha256: null,
  contentType: null,
  attempts: 0,
  error: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const envelope = {
  type: 'artifact.generate',
  schemaVersion: 1,
  organizationId: org,
  correlationId: 'csv-key',
  payload: { artifactJobId: id },
};

describe('artifact worker', () => {
  it('stores an organization-bound CSV and remains retryable after storage failures', async () => {
    let attempts = 0;
    let stored: Uint8Array | undefined;
    let finished = false;
    const task = createArtifactTask({
      deploymentMode: 'cloud',
      getOrganization: async () => ({ status: 'active' }),
      jobs: {
        enqueue: async () => job,
        getById: async () => job,
        claim: async (ctx, jobId) => {
          expect(ctx.organizationId).toBe(org);
          expect(jobId).toBe(id);
          return job;
        },
        complete: async (ctx, jobId, ref) => {
          expect(ctx.organizationId).toBe(org);
          expect(jobId).toBe(id);
          expect(ref.organizationId).toBe(org);
          finished = true;
        },
        fail: async () => {
          throw new Error('Should not be terminal');
        },
      },
      organizations: { getById: async () => null, update: async () => null },
      confirmations: { getByGroup: async () => null },
      exports: {
        listByEvent: async () => [
          {
            driver: '=1+1',
            vehicle: 'Car',
            class: 'GT',
            startNumber: null,
            status: 'accepted',
            priceCents: null,
          },
        ],
      },
      storage: {
        put: async (input) => {
          expect(input.organizationId).toBe(org);
          attempts++;
          if (attempts === 1) throw new Error('temporary storage outage');
          stored = input.body;
          return {
            organizationId: org as never,
            objectId: '44444444-4444-4444-8444-444444444444',
            contentType: input.contentType,
            size: input.body.length,
            sha256: 'a'.repeat(64),
          };
        },
        get: async () => null,
        delete: async () => {},
      },
    });
    await expect(
      task(envelope, {
        job: { id: 'graphile-1', attempts: 1, max_attempts: 3 },
      }),
    ).rejects.toThrow('temporary storage outage');
    expect(finished).toBe(false);
    await task(envelope, {
      job: { id: 'graphile-1', attempts: 2, max_attempts: 3 },
    });
    expect(finished).toBe(true);
    expect(new TextDecoder().decode(stored)).toContain("'=1+1");
  });
});
