import { randomUUID } from 'node:crypto';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import type { ArtifactJob, ArtifactJobRepository } from '@racepilot/core';
import { organizationId } from '@racepilot/core';
import { artifactJobAudit, artifactJobs } from './artifact-job-schema.js';
import type { Database } from './database.js';

const ARTIFACT_EXPIRY_MS = 24 * 60 * 60 * 1000;
type EnqueueRowResult =
  | { readonly ok: true; readonly row: typeof artifactJobs.$inferSelect }
  | { readonly ok: false; readonly error: 'idempotency-conflict' };

function enqueueSuccess(
  row: typeof artifactJobs.$inferSelect,
): EnqueueRowResult {
  return { ok: true, row };
}

function enqueueConflict(): EnqueueRowResult {
  return { ok: false, error: 'idempotency-conflict' };
}

function toArtifactJob(row: typeof artifactJobs.$inferSelect): ArtifactJob {
  return {
    ...row,
    organizationId: organizationId(row.organizationId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt:
      row.expiresAt?.toISOString() ??
      (row.status === 'ready'
        ? new Date(row.createdAt.getTime() + ARTIFACT_EXPIRY_MS).toISOString()
        : null),
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
            filters: input.filters ?? {},
            delimiter: input.delimiter ?? ';',
            idempotencyKey: input.idempotencyKey,
          })
          .onConflictDoNothing({
            target: [artifactJobs.organizationId, artifactJobs.idempotencyKey],
          })
          .returning();
        if (inserted) {
          await tx.insert(artifactJobAudit).values({
            organizationId: ctx.organizationId,
            eventId: input.eventId,
            artifactJobId: inserted.id,
            actor: ctx.subject
              ? `${ctx.subject.issuer}|${ctx.subject.subject}`
              : 'system',
          });
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
          return enqueueSuccess(inserted);
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
            JSON.stringify([...(input.fields ?? [])]) ||
          JSON.stringify(existing.filters) !==
            JSON.stringify(input.filters ?? {}) ||
          existing.delimiter !== (input.delimiter ?? ';')
        )
          return enqueueConflict();
        return enqueueSuccess(existing);
      });
      if (!result.ok) return result;
      return { ok: true, job: toArtifactJob(result.row) };
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
    listByEvent: async (ctx, eventId, kind, limit) => {
      const rows = await db
        .select()
        .from(artifactJobs)
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.eventId, eventId),
          ),
        )
        .orderBy(sql`${artifactJobs.createdAt} desc`)
        .limit(limit);
      return rows.map(toArtifactJob);
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
          expiresAt: new Date(Date.now() + ARTIFACT_EXPIRY_MS),
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
