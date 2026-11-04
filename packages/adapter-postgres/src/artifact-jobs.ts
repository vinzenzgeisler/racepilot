import { randomUUID } from 'node:crypto';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  ArtifactJob,
  ArtifactJobRepository,
  ArtifactKind,
} from '@racepilot/core';
import { organizationId } from '@racepilot/core';
import { events } from './schema/organization.js';
import { registrationGroups } from './schema/entries.js';
import type { Database } from './database.js';

export const artifactJobs = pgTable(
  'artifact_job',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    kind: text('kind').$type<ArtifactKind>().notNull(),
    registrationGroupId: uuid('registration_group_id'),
    fields: jsonb('fields').$type<string[]>().notNull().default([]),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status')
      .$type<ArtifactJob['status']>()
      .notNull()
      .default('queued'),
    objectId: uuid('object_id'),
    sha256: text('sha256'),
    contentType: text('content_type'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimToken: uuid('claim_token'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('artifact_job_org_id_unique').on(t.organizationId, t.id),
    unique('artifact_job_org_idempotency_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'artifact_job_org_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'artifact_job_group_fk',
    }).onDelete('cascade'),
    index('artifact_job_org_status_idx').on(
      t.organizationId,
      t.status,
      t.createdAt,
    ),
  ],
);

function toArtifactJob(row: typeof artifactJobs.$inferSelect): ArtifactJob {
  return {
    ...row,
    organizationId: organizationId(row.organizationId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createArtifactJobRepository(
  db: Database,
): ArtifactJobRepository {
  return {
    enqueue: async (ctx, input) => {
      const result = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(artifactJobs)
          .values({
            organizationId: ctx.organizationId,
            eventId: input.eventId,
            kind: input.kind,
            registrationGroupId: input.registrationGroupId ?? null,
            fields: [...(input.fields ?? [])],
            idempotencyKey: input.idempotencyKey,
          })
          .onConflictDoNothing({
            target: [artifactJobs.organizationId, artifactJobs.idempotencyKey],
          })
          .returning();
        if (inserted) {
          const envelope = {
            type: 'artifact.generate',
            schemaVersion: 1,
            organizationId: ctx.organizationId,
            correlationId: input.idempotencyKey,
            payload: { artifactJobId: inserted.id },
          };
          await tx.execute(
            sql`select graphile_worker.add_job('artifact_generate', ${JSON.stringify(envelope)}::json, null, now(), 25, ${`artifact:${inserted.id}`})`,
          );
          return inserted;
        }
        const [existing] = await tx
          .select()
          .from(artifactJobs)
          .where(
            and(
              eq(artifactJobs.organizationId, ctx.organizationId),
              eq(artifactJobs.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (
          !existing ||
          existing.eventId !== input.eventId ||
          existing.kind !== input.kind ||
          existing.registrationGroupId !==
            (input.registrationGroupId ?? null) ||
          JSON.stringify(existing.fields) !==
            JSON.stringify([...(input.fields ?? [])])
        )
          throw new Error('Artifact idempotency key conflict');
        return existing;
      });
      return toArtifactJob(result);
    },
    getById: async (ctx, id) => {
      const [row] = await db
        .select()
        .from(artifactJobs)
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
          ),
        )
        .limit(1);
      return row ? toArtifactJob(row) : null;
    },
    claim: async (ctx, id) => {
      const claimToken = randomUUID();
      const [row] = await db
        .update(artifactJobs)
        .set({
          status: 'processing',
          attempts: sql`${artifactJobs.attempts} + 1`,
          error: null,
          claimedAt: new Date(),
          claimToken,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
            or(
              eq(artifactJobs.status, 'queued'),
              and(
                eq(artifactJobs.status, 'processing'),
                lt(artifactJobs.claimedAt, sql`now() - interval '5 minutes'`),
              ),
            ),
          ),
        )
        .returning();
      return row ? { ...toArtifactJob(row), claimToken } : null;
    },
    release: async (ctx, id, claimToken) => {
      await db
        .update(artifactJobs)
        .set({
          status: 'queued',
          claimedAt: null,
          claimToken: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
            eq(artifactJobs.status, 'processing'),
            eq(artifactJobs.claimToken, claimToken),
          ),
        );
    },
    complete: async (ctx, id, claimToken, ref) => {
      if (ref.organizationId !== ctx.organizationId)
        throw new Error('Artifact owner mismatch');
      await db
        .update(artifactJobs)
        .set({
          status: 'ready',
          claimedAt: null,
          claimToken: null,
          objectId: ref.objectId,
          sha256: ref.sha256,
          contentType: ref.contentType,
          error: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
            eq(artifactJobs.status, 'processing'),
            eq(artifactJobs.claimToken, claimToken),
          ),
        );
    },
    fail: async (ctx, id, claimToken, error) => {
      await db
        .update(artifactJobs)
        .set({
          status: 'failed',
          claimedAt: null,
          claimToken: null,
          error: error.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
            eq(artifactJobs.status, 'processing'),
            eq(artifactJobs.claimToken, claimToken),
          ),
        );
    },
  };
}
