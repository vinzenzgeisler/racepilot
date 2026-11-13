import { and, eq, inArray } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  artifactJobs,
  createArtifactJobRepository,
  createDatabase,
  emailOutbox,
  enqueueMailOutbox,
  events,
  migrate,
  organizations,
  type Database,
} from '@racepilot/adapter-postgres';
import {
  createRequestContext,
  organizationId,
  type MailMessage,
  type ObjectStorageProvider,
} from '@racepilot/core';
import { createProductWorker } from './product.js';

const databaseUrl = process.env.RACEPILOT_TEST_DATABASE_URL;

type Tenant = { id: string; origin: string };
type Tasks = ReturnType<typeof createProductWorker>['taskList'];

function recordingStorage() {
  const stored: string[] = [];
  const storage: ObjectStorageProvider = {
    put: async ({ organizationId: org, body, contentType }) => {
      const objectId = crypto.randomUUID();
      stored.push(`${org}/${objectId}`);
      return {
        organizationId: org,
        objectId,
        contentType,
        size: body.byteLength,
        sha256: 'a'.repeat(64),
      };
    },
    get: async () => null,
    delete: async () => {},
  };
  return { storage, stored };
}

describe.skipIf(!databaseUrl)(
  'product worker with two organizations',
  { timeout: 120_000 },
  () => {
    let db: Database;
    let end: () => Promise<void>;
    let a: Tenant;
    let b: Tenant;
    let tasks: Tasks;
    let objects: string[];
    const sent = vi.fn(async (message: MailMessage) => {
      void message;
    });
    let eventId: string;
    let exportJobId: string;
    let outboxId: string;
    let verificationOutboxId: string;

    const envelope = (
      tenant: string,
      type: 'artifact.generate' | 'mail.outbox',
      payload: Record<string, string>,
    ) => ({
      type,
      schemaVersion: 1,
      organizationId: tenant,
      correlationId: crypto.randomUUID(),
      payload,
    });
    const run = (
      task: 'artifact_generate' | 'mail_outbox',
      payload: unknown,
    ) => {
      const handler = tasks[task];
      if (!handler) throw new Error(`${task} is not registered`);
      return handler(payload, { job: { id: crypto.randomUUID() } });
    };
    const exportJob = async () =>
      (
        await db
          .select()
          .from(artifactJobs)
          .where(eq(artifactJobs.id, exportJobId))
      )[0];
    const outbox = async (id: string) =>
      (await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)))[0];

    beforeAll(async () => {
      const url = databaseUrl ?? '';
      await migrate(url);
      await runMigrations({ connectionString: url });
      const created = await createDatabase(url);
      db = created.db;
      end = () => created.pool.end();
      const suffix = crypto.randomUUID().slice(0, 8);
      const make = async (key: 'a' | 'b'): Promise<Tenant> => {
        const [row] = await db
          .insert(organizations)
          .values({
            slug: `worker-${key}-${suffix}`,
            name: `Worker ${key.toUpperCase()}`,
            timezone: 'UTC',
            locale: 'en',
            mailFrom: `club-${key}@example.test`,
          })
          .returning();
        if (!row) throw new Error('Organization insert failed');
        return { id: row.id, origin: `https://${key}-${suffix}.example.test` };
      };
      a = await make('a');
      b = await make('b');
      const origins = new Map(
        [a, b].map((tenant) => [tenant.id, tenant.origin]),
      );
      const recorder = recordingStorage();
      objects = recorder.stored;
      tasks = createProductWorker({
        db,
        edition: { deploymentMode: 'cloud' },
        storage: recorder.storage,
        mail: {
          provider: { send: sent },
          canonicalOrigin: async (tenant) =>
            origins.get(tenant.organizationId) ?? null,
          leaseMs: 300_000,
        },
      }).taskList;

      const [event] = await db
        .insert(events)
        .values({
          organizationId: a.id,
          slug: 'worker-event',
          name: 'Worker event',
          startsOn: '2031-01-01',
          endsOn: '2031-01-02',
          status: 'open',
        })
        .returning();
      eventId = event?.id ?? '';
      const queued = await createArtifactJobRepository(db).enqueue(
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(a.id),
          permissions: new Set(),
          capabilities: new Set(),
          correlationId: 'seed',
        }),
        {
          eventId,
          kind: 'entries_csv',
          fields: ['startNumber'],
          filters: {},
          delimiter: ';',
          idempotencyKey: `worker-export-${suffix}`,
        },
      );
      if (!queued.ok) throw new Error('Artifact job was not queued');
      exportJobId = queued.job.id;
      outboxId = await enqueueMailOutbox(db, a.id, {
        templateKey: 'message-campaign',
        templateVersion: 1,
        locale: 'en',
        recipient: 'driver-a@example.test',
        idempotencyKey: `worker-mail-${suffix}`,
        variables: { subject: 'Hello', body: 'From A' },
      });
      verificationOutboxId = await enqueueMailOutbox(db, a.id, {
        templateKey: 'verification',
        templateVersion: 1,
        locale: 'en',
        recipient: 'driver-a@example.test',
        idempotencyKey: `worker-verification-${suffix}`,
        variables: {
          recipientName: 'Ada',
          verificationUrl: `${b.origin}/registration/verify?token=forged`,
        },
      });
    });

    afterAll(async () => {
      if (!db) return;
      try {
        if (a && b) {
          const ids = [a.id, b.id];
          await db
            .delete(emailOutbox)
            .where(inArray(emailOutbox.organizationId, ids));
          await db.delete(events).where(inArray(events.organizationId, ids));
          await db.delete(organizations).where(inArray(organizations.id, ids));
        }
      } finally {
        await end();
      }
    });

    it('ignores jobs that name another organization and changes nothing of A', async () => {
      const foreignExport = envelope(b.id, 'artifact.generate', {
        artifactJobId: exportJobId,
      });
      await run('artifact_generate', foreignExport).catch(() => undefined);
      expect((await exportJob())?.status).toBe('queued');
      expect(objects).toEqual([]);

      const foreignMail = envelope(b.id, 'mail.outbox', { outboxId });
      await run('mail_outbox', foreignMail);
      expect(sent).not.toHaveBeenCalled();
      expect(await outbox(outboxId)).toMatchObject({
        status: 'pending',
        attempts: 0,
      });

      const unknown = envelope(crypto.randomUUID(), 'mail.outbox', {
        outboxId,
      });
      await run('mail_outbox', unknown);
      await run(
        'artifact_generate',
        envelope(crypto.randomUUID(), 'artifact.generate', {
          artifactJobId: exportJobId,
        }),
      ).catch(() => undefined);
      expect(sent).not.toHaveBeenCalled();
      expect((await exportJob())?.status).toBe('queued');
    });

    it('refuses a verification link that points to another organization origin', async () => {
      await expect(
        run(
          'mail_outbox',
          envelope(a.id, 'mail.outbox', { outboxId: verificationOutboxId }),
        ),
      ).rejects.toThrow(/canonical origin/);
      expect(sent).not.toHaveBeenCalled();
    });

    it('processes the same jobs for the owning organization (positive control)', async () => {
      await run(
        'artifact_generate',
        envelope(a.id, 'artifact.generate', { artifactJobId: exportJobId }),
      );
      expect((await exportJob())?.status).toBe('ready');
      expect(objects).toHaveLength(1);
      expect(objects[0]?.startsWith(`${a.id}/`)).toBe(true);

      await run('mail_outbox', envelope(a.id, 'mail.outbox', { outboxId }));
      expect(sent).toHaveBeenCalledOnce();
      expect(await outbox(outboxId)).toMatchObject({ status: 'sent' });
      const [ownedByB] = await db
        .select()
        .from(emailOutbox)
        .where(and(eq(emailOutbox.organizationId, b.id)));
      expect(ownedByB).toBeUndefined();
    });
  },
);
