import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ArtifactJob } from '@racepilot/core';
import { createArtifactTask } from './artifacts.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const groupId = '33333333-3333-4333-8333-333333333333';
const jobId = '44444444-4444-4444-8444-444444444444';
const objectId = '55555555-5555-4555-8555-555555555555';

describe('artifact PDF end-to-end', () => {
  it('generates a PDF in the worker and downloads it through the tenant-scoped artifact-job route', async () => {
    let job: ArtifactJob = {
      id: jobId,
      organizationId: organizationId as never,
      eventId,
      kind: 'confirmation_pdf',
      registrationGroupId: groupId,
      fields: [],
      idempotencyKey: 'confirmation-e2e',
      status: 'queued',
      objectId: null,
      sha256: null,
      contentType: null,
      attempts: 0,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const persisted: {
      value: {
        ref: {
          organizationId: string;
          objectId: string;
          contentType: string;
          size: number;
          sha256: string;
        };
        body: Uint8Array;
      } | null;
    } = { value: null };
    const storage = {
      put: async (input: {
        organizationId: string;
        body: Uint8Array;
        contentType: string;
      }) => {
        const ref = {
          organizationId: input.organizationId,
          objectId,
          contentType: input.contentType,
          size: input.body.length,
          sha256: createHash('sha256').update(input.body).digest('hex'),
        };
        persisted.value = { ref, body: input.body };
        return ref as never;
      },
      get: async (owner: string, id: string) =>
        persisted.value?.ref.organizationId === owner &&
        persisted.value.ref.objectId === id
          ? persisted.value
          : null,
      delete: async () => {},
    };
    const repos = {
      enqueue: async () => job,
      getById: async () => job,
      claim: async () => {
        if (job.status !== 'queued') return null;
        job = { ...job, status: 'processing', attempts: job.attempts + 1 };
        return { ...job, claimToken: 'claim-token' };
      },
      release: async () => {
        job = { ...job, status: 'queued' };
      },
      complete: async (
        _ctx: unknown,
        _id: string,
        _claimToken: string,
        ref: { objectId: string; sha256: string; contentType: string },
      ) => {
        job = {
          ...job,
          status: 'ready',
          objectId: ref.objectId,
          sha256: ref.sha256,
          contentType: ref.contentType,
        };
      },
      fail: async () => {
        job = { ...job, status: 'failed' };
      },
    };
    const worker = createArtifactTask({
      deploymentMode: 'cloud',
      getOrganization: async () => ({ status: 'active' }),
      jobs: repos,
      organizations: {
        getById: async () => ({ name: 'Example Club', contactEmail: null }),
        update: async () => null,
      } as never,
      confirmations: {
        getByGroup: async () => ({
          eventId,
          eventName: 'Spring Rally',
          eventStartsOn: '2026-05-01',
          registrationGroupId: groupId,
          driverName: 'Ada Driver',
          vehicles: ['Blue Roadster'],
          classes: ['GT'],
          priceSnapshot: {
            version: '1',
            currency: 'EUR',
            calculatedAt: '2026-01-01T00:00:00.000Z',
            totalCents: 2500,
            lines: [],
          },
          paymentReference: 'RP-E2E',
        }),
      } as never,
      exports: { listByEvent: async () => [] },
      storage: storage as never,
    });
    await worker(
      {
        type: 'artifact.generate',
        schemaVersion: 1,
        organizationId,
        correlationId: 'confirmation-e2e',
        payload: { artifactJobId: jobId },
      },
      { job: { id: 'graphile-e2e', attempts: 1, max_attempts: 3 } },
    );
    expect(job.status).toBe('ready');
    expect(persisted.value?.ref.contentType).toBe('application/pdf');

    const apiModulePath: string = '../../api/src/index.js';
    const { createApp } = await import(apiModulePath);
    const app = createApp({
      config: { deploymentMode: 'community', organizationId },
      organizations: {
        getById: async () => ({
          id: organizationId,
          slug: 'example',
          name: 'Example',
          status: 'active',
          contactEmail: null,
          websiteUrl: null,
          timezone: 'UTC',
          locale: 'en',
          currency: 'EUR',
        }),
        update: async () => null,
      } as never,
      events: {} as never,
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'admin',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['entry:read']),
      } as never,
      artifactJobs: repos as never,
      objectStorage: storage as never,
    });
    const response = await app.request(`/admin/artifact-jobs/${jobId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    const downloaded = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(downloaded.subarray(0, 5)).toString('ascii')).toBe(
      '%PDF-',
    );
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(
      job.sha256,
    );
  });
});
