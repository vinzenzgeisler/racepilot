import type { Database } from './database.js';

import type { RequestContext } from '@racepilot/core';

import { sql } from 'drizzle-orm';

import {
  TimingRepository,
  TimingMeasurementInput,
  TimingDbRow,
  mapTimingRow,
  timingUuid,
  isDuplicateTimingRun,
  TimingMeasurementRecord,
  TimingResultDbRow,
  mapTimingResult,
} from './timing-types.js';

export function createTimingRepository(db: Database): TimingRepository {
  const insert = async (
    tx: Database,
    ctx: RequestContext,
    eventId: string,
    input: TimingMeasurementInput,
    actor: string,
    previousId: string | null,
  ) => {
    const versionResult =
      await tx.execute(sql`SELECT COALESCE(MAX(version), 0) + 1 AS version
      FROM timing_measurement WHERE organization_id=${ctx.organizationId} AND event_id=${eventId}
      AND entry_id=${input.entryId} AND run=${input.run}`);
    const version = Number(
      (versionResult as unknown as { rows: { version: number }[] }).rows[0]
        ?.version ?? 1,
    );
    const result = await tx.execute(sql`INSERT INTO timing_measurement
      (organization_id,event_id,entry_id,run,time_ms,penalty_ms,exclusion,source,recorded_at,recorded_by,version,supersedes_id)
      SELECT ${ctx.organizationId},${eventId},${input.entryId},${input.run},${input.timeMs},${input.penaltyMs ?? 0},
      ${input.exclusion ?? null},${input.source},${input.recordedAt}::timestamptz,${actor},${version},${previousId}
      WHERE EXISTS (SELECT 1 FROM event WHERE organization_id=${ctx.organizationId} AND id=${eventId})
      AND EXISTS (SELECT 1 FROM entry WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} AND id=${input.entryId})
      RETURNING *`);
    const row = (result as unknown as { rows: TimingDbRow[] }).rows[0];
    if (!row) return null;
    await tx.execute(sql`INSERT INTO timing_audit (organization_id,event_id,measurement_id,action,actor,details)
      VALUES (${ctx.organizationId},${eventId},${row.id},${previousId ? 'correct' : 'record'},${actor},
      ${JSON.stringify({ run: input.run, version })}::jsonb)`);
    return mapTimingRow(row);
  };
  return {
    listEntries: async (ctx, eventId) => {
      if (!timingUuid.test(eventId)) return [];
      const result = await db.execute(sql`SELECT e.id, e.requested_start_number,
        status.value->>'category' AS status_category
        FROM entry e
        LEFT JOIN entry_workflow_revision w ON w.organization_id=e.organization_id AND w.id=e.workflow_revision_id
        LEFT JOIN LATERAL jsonb_array_elements(COALESCE(w.workflow->'statuses', '[]'::jsonb)) AS status(value)
          ON status.value->>'key'=e.acceptance_status
        WHERE e.organization_id=${ctx.organizationId} AND e.event_id=${eventId} AND e.deleted_at IS NULL
        ORDER BY e.requested_start_number, e.id`);
      const rows =
        (
          result as unknown as {
            rows: {
              id: string;
              requested_start_number: string | null;
              status_category: string | null;
            }[];
          }
        ).rows ?? [];
      return rows.map((row) => ({
        entryId: row.id,
        startNumber: row.requested_start_number ?? row.id,
        statusCategory: row.status_category,
      }));
    },
    record: async (ctx, eventId, input, actor) => {
      if (!timingUuid.test(eventId) || !timingUuid.test(input.entryId))
        return null;
      try {
        return await db.transaction((tx) =>
          insert(tx as unknown as Database, ctx, eventId, input, actor, null),
        );
      } catch (error) {
        if (isDuplicateTimingRun(error))
          throw new Error('Duplicate timing run');
        throw error;
      }
    },
    recordMany: async (ctx, eventId, inputs, actor) => {
      if (
        !timingUuid.test(eventId) ||
        inputs.some((input) => !timingUuid.test(input.entryId))
      )
        return [];
      try {
        return await db.transaction(async (transaction) => {
          const tx = transaction as unknown as Database;
          const results: TimingMeasurementRecord[] = [];
          for (const input of inputs) {
            const row = await insert(tx, ctx, eventId, input, actor, null);
            if (!row) throw new Error('Timing entry not found');
            results.push(row);
          }
          return results;
        });
      } catch (error) {
        if (isDuplicateTimingRun(error))
          throw new Error('Duplicate timing run');
        throw error;
      }
    },
    list: async (ctx, eventId) => {
      if (!timingUuid.test(eventId)) return [];
      const result = await db.execute(sql`SELECT * FROM timing_measurement
        WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} ORDER BY entry_id,run,version`);
      return ((result as unknown as { rows: TimingDbRow[] }).rows ?? []).map(
        mapTimingRow,
      );
    },
    createDraft: async (ctx, eventId, rule, results, actor) => {
      if (!timingUuid.test(eventId)) return null;
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        await tx.execute(
          sql`SELECT id FROM event WHERE organization_id=${ctx.organizationId} AND id=${eventId} FOR UPDATE`,
        );
        const result =
          await tx.execute(sql`INSERT INTO timing_result_version (organization_id,event_id,version,status,rule,results,actor)
          SELECT ${ctx.organizationId},${eventId},COALESCE(MAX(version),0)+1,'draft',${JSON.stringify(rule)}::jsonb,${JSON.stringify(results)}::jsonb,${actor}
          FROM timing_result_version WHERE organization_id=${ctx.organizationId} AND event_id=${eventId}
          RETURNING event_id,version,status,rule,results,actor,created_at,published_at`);
        const row = (result as unknown as { rows: TimingResultDbRow[] })
          .rows[0];
        if (!row) return null;
        await tx.execute(sql`INSERT INTO timing_audit (organization_id,event_id,result_version,action,actor,details)
          VALUES (${ctx.organizationId},${eventId},${row.version},'draft',${actor},'{}'::jsonb)`);
        return mapTimingResult(row);
      });
    },
    publish: async (ctx, eventId, version, actor) => {
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        const result =
          await tx.execute(sql`UPDATE timing_result_version SET status='published',published_at=now()
          WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} AND version=${version} AND status='draft'
          RETURNING event_id,version,status,rule,results,actor,created_at,published_at`);
        const row = (result as unknown as { rows: TimingResultDbRow[] })
          .rows[0];
        if (!row) return null;
        await tx.execute(sql`INSERT INTO timing_audit (organization_id,event_id,result_version,action,actor,details)
          VALUES (${ctx.organizationId},${eventId},${version},'publish',${actor},'{}'::jsonb)`);
        return mapTimingResult(row);
      });
    },
    latestPublished: async (ctx, eventId) => {
      if (!timingUuid.test(eventId)) return null;
      const result =
        await db.execute(sql`SELECT event_id,version,status,rule,results,actor,created_at,published_at FROM timing_result_version
        WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} AND status='published' ORDER BY version DESC LIMIT 1`);
      const row = (result as unknown as { rows: TimingResultDbRow[] }).rows[0];
      return row ? mapTimingResult(row) : null;
    },
    resolveEntry: async (ctx, eventId, lookup) => {
      if (!timingUuid.test(eventId)) return null;
      const result =
        await db.execute(sql`SELECT id, requested_start_number FROM entry WHERE organization_id=${ctx.organizationId}
        AND event_id=${eventId} AND deleted_at IS NULL AND (${lookup.entryId ? sql`id=${lookup.entryId}` : sql`requested_start_number=${lookup.startNumber ?? ''}`}) LIMIT 2`);
      const rows =
        (
          result as unknown as {
            rows: { id: string; requested_start_number: string | null }[];
          }
        ).rows ?? [];
      if (rows.length !== 1) return null;
      return {
        entryId: rows[0]!.id,
        startNumber: rows[0]!.requested_start_number ?? rows[0]!.id,
      };
    },
    correct: async (ctx, eventId, measurementId, input, actor) => {
      if (!timingUuid.test(eventId) || !timingUuid.test(measurementId))
        return null;
      try {
        return await db.transaction(async (transaction) => {
          const tx = transaction as unknown as Database;
          const found =
            await tx.execute(sql`SELECT * FROM timing_measurement WHERE organization_id=${ctx.organizationId}
            AND event_id=${eventId} AND id=${measurementId} AND active FOR UPDATE`);
          const old = (found as unknown as { rows: TimingDbRow[] }).rows[0];
          if (!old) return null;
          await tx.execute(sql`UPDATE timing_measurement SET active=false WHERE organization_id=${ctx.organizationId}
            AND event_id=${eventId} AND id=${measurementId}`);
          const next = await insert(
            tx,
            ctx,
            eventId,
            {
              entryId: input.entryId ?? old.entry_id,
              run: input.run ?? old.run,
              timeMs: input.timeMs ?? old.time_ms,
              penaltyMs: input.penaltyMs ?? old.penalty_ms,
              ...('exclusion' in input
                ? input.exclusion
                  ? { exclusion: input.exclusion }
                  : {}
                : old.exclusion
                  ? { exclusion: old.exclusion }
                  : {}),
              source: input.source ?? old.source,
              recordedAt: input.recordedAt ?? new Date().toISOString(),
            },
            actor,
            old.id,
          );
          if (!next) throw new Error('Timing correction target not found');
          return next;
        });
      } catch (error) {
        if (isDuplicateTimingRun(error))
          throw new Error('Duplicate timing run');
        throw error;
      }
    },
  };
}
