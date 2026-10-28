import { runMigrations } from 'graphile-worker';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { JobContext, MailProvider } from '@racepilot/core';
import { organizationId } from '@racepilot/core';
import {
  createDatabase,
  createMailOutboxRepository,
  enqueueMailOutbox,
  emailDeliveries,
  emailOutbox,
  organizations,
} from '@racepilot/adapter-postgres';
import { processMailOutboxJob } from './mail.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
describe.skipIf(!url)('mail outbox PostgreSQL/Graphile integration', () => {
  it('schedules a future retry job, then records terminal delivery failure', async () => {
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    let orgId: string | undefined;
    let outboxId: string | undefined;
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `mail-retry-${suffix}`,
          name: 'Mail Retry',
          timezone: 'UTC',
          locale: 'en',
          mailFrom: 'sender@example.test',
        })
        .returning();
      orgId = org!.id;
      const id = await db.transaction((tx) =>
        enqueueMailOutbox(
          db,
          orgId!,
          {
            templateKey: 'verification',
            templateVersion: 1,
            locale: 'en',
            recipient: 'recipient@example.test',
            idempotencyKey: suffix,
            variables: {
              recipientName: 'Sam',
              verificationUrl: 'https://example.test/verify',
            },
            correlationId: suffix,
          },
          tx,
        ),
      );
      outboxId = id;
      const ctx: JobContext = {
        deploymentMode: 'cloud',
        organizationId: organizationId(orgId),
        jobId: `test-${suffix}`,
        correlationId: suffix,
      };
      const repository = createMailOutboxRepository(db);
      const mail: MailProvider = {
        send: async () => {
          throw new Error('smtp unavailable');
        },
      };
      const now = new Date();
      await processMailOutboxJob({
        ctx,
        outboxId: id,
        deps: {
          repository,
          mail,
          now: () => new Date(now.getTime() - 1),
          maxAttempts: 2,
        },
      });
      const [retryRow] = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.id, id));
      expect(retryRow?.status).toBe('pending');
      expect(retryRow?.availableAt.getTime()).toBeGreaterThan(now.getTime());
      const jobs = await db.execute(
        sql`select key, run_at from graphile_worker.jobs where key = ${`mail-outbox:${id}`}`,
      );
      const scheduled = (
        jobs as unknown as { rows: Array<{ key: string; run_at: Date }> }
      ).rows[0];
      expect(scheduled?.key).toBe(`mail-outbox:${id}`);
      expect(new Date(scheduled!.run_at).getTime()).toBeGreaterThan(
        now.getTime(),
      );

      await db
        .update(emailOutbox)
        .set({ availableAt: new Date(Date.now() - 1) })
        .where(eq(emailOutbox.id, id));
      await processMailOutboxJob({
        ctx,
        outboxId: id,
        deps: { repository, mail, maxAttempts: 2 },
      });
      const [failed] = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.id, id));
      expect(failed?.status).toBe('failed');
      expect(
        await db
          .select()
          .from(emailDeliveries)
          .where(
            and(
              eq(emailDeliveries.outboxId, id),
              eq(emailDeliveries.outcome, 'failed'),
            ),
          ),
      ).toHaveLength(1);
    } finally {
      if (outboxId)
        await db.execute(
          sql`select graphile_worker.remove_job(${`mail-outbox:${outboxId}`})`,
        );
      if (orgId)
        await db.delete(organizations).where(eq(organizations.id, orgId));
      await pool.end();
    }
  });

  it('reclaims a sending row after its configured lease expires', async () => {
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    let orgId: string | undefined;
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `mail-lease-${suffix}`,
          name: 'Mail Lease',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      orgId = org!.id;
      const id = await enqueueMailOutbox(db, orgId, {
        templateKey: 'verification',
        templateVersion: 1,
        locale: 'en',
        recipient: 'recipient@example.test',
        idempotencyKey: suffix,
        variables: {
          recipientName: 'Sam',
          verificationUrl: 'https://example.test/verify',
        },
      });
      const ctx = { organizationId: orgId };
      const repository = createMailOutboxRepository(db, { leaseMs: 60_000 });
      expect(await repository.claim(ctx, id)).not.toBeNull();
      await db
        .update(emailOutbox)
        .set({ claimedAt: new Date(Date.now() - 61_000) })
        .where(eq(emailOutbox.id, id));
      expect(await repository.claim(ctx, id)).not.toBeNull();
    } finally {
      if (orgId)
        await db.delete(organizations).where(eq(organizations.id, orgId));
      await db.execute(
        sql`select graphile_worker.remove_job(${`mail-outbox:${suffix}`})`,
      );
      await pool.end();
    }
  });
});
