import type { Database } from './database.js';

import { organizationId, normalizeEntryWorkflow } from '@racepilot/core';

import { sql } from 'drizzle-orm';

export function createEntryWorkflowRepository(
  db: Database,
): import('@racepilot/core').EntryWorkflowRepository {
  const map = (row: {
    id: string;
    organization_id: string;
    event_id: string | null;
    version: number;
    workflow: import('@racepilot/core').EntryWorkflow;
  }) => ({
    id: row.id,
    organizationId: organizationId(row.organization_id),
    eventId: row.event_id,
    version: row.version,
    workflow: normalizeEntryWorkflow(row.workflow),
  });
  return {
    getOrganization: async (ctx) => {
      const result = await db.execute(
        sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id WHERE c.organization_id=${ctx.organizationId} AND c.event_id IS NULL`,
      );
      const row = (result as unknown as { rows: Parameters<typeof map>[0][] })
        .rows[0];
      return row ? map(row) : null;
    },
    getEffective: async (ctx, eventId) => {
      const result = await db.execute(
        sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id JOIN event e ON e.organization_id=c.organization_id AND e.id=c.event_id WHERE c.organization_id=${ctx.organizationId} AND c.event_id=${eventId} UNION ALL SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id JOIN event e ON e.organization_id=c.organization_id AND e.id=${eventId} WHERE c.organization_id=${ctx.organizationId} AND c.event_id IS NULL AND NOT EXISTS (SELECT 1 FROM entry_workflow_current x WHERE x.organization_id=c.organization_id AND x.event_id=e.id) LIMIT 1`,
      );
      const row = (result as unknown as { rows: Parameters<typeof map>[0][] })
        .rows[0];
      return row ? map(row) : null;
    },
    getPinnedForEntry: async (ctx, entryId) => {
      const result = await db.execute(
        sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry e JOIN entry_workflow_revision r ON r.organization_id=e.organization_id AND r.id=e.workflow_revision_id WHERE e.organization_id=${ctx.organizationId} AND e.id=${entryId} AND e.deleted_at IS NULL`,
      );
      const row = (result as unknown as { rows: Parameters<typeof map>[0][] })
        .rows[0];
      return row ? map(row) : null;
    },
    setOrganization: async (ctx, workflow, actor, reason) =>
      db.transaction(async (tx) => {
        const current = await tx.execute(
          sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id WHERE c.organization_id=${ctx.organizationId} AND c.event_id IS NULL FOR UPDATE OF c`,
        );
        const old = (
          current as unknown as { rows: Parameters<typeof map>[0][] }
        ).rows[0];
        if (!old) throw new Error('Organization workflow not found');
        const inserted = await tx.execute(
          sql`INSERT INTO entry_workflow_revision (organization_id,event_id,version,workflow,actor,reason) VALUES (${ctx.organizationId},NULL,${old.version + 1},${JSON.stringify(workflow)}::jsonb,${actor},${reason}) RETURNING id, organization_id, event_id, version, workflow`,
        );
        const revision = (
          inserted as unknown as { rows: Parameters<typeof map>[0][] }
        ).rows[0];
        if (!revision) throw new Error('Workflow revision insert failed');
        await tx.execute(
          sql`UPDATE entry_workflow_current SET workflow_revision_id=${revision.id} WHERE organization_id=${ctx.organizationId} AND event_id IS NULL`,
        );
        await tx.execute(
          sql`INSERT INTO entry_workflow_audit (organization_id,event_id,workflow_revision_id,actor,reason) VALUES (${ctx.organizationId},NULL,${revision.id},${actor},${reason})`,
        );
        return map(revision);
      }),
    setEvent: async (ctx, eventId, workflow, actor, reason) =>
      db.transaction(async (tx) => {
        const current = await tx.execute(
          sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id JOIN event e ON e.organization_id=c.organization_id AND e.id=c.event_id WHERE c.organization_id=${ctx.organizationId} AND c.event_id=${eventId} FOR UPDATE OF c`,
        );
        const old = (
          current as unknown as { rows: Parameters<typeof map>[0][] }
        ).rows[0];
        if (!old) return null;
        const inserted = await tx.execute(
          sql`INSERT INTO entry_workflow_revision (organization_id,event_id,version,workflow,actor,reason) VALUES (${ctx.organizationId},${eventId},${old.version + 1},${JSON.stringify(workflow)}::jsonb,${actor},${reason}) RETURNING id, organization_id, event_id, version, workflow`,
        );
        const revision = (
          inserted as unknown as { rows: Parameters<typeof map>[0][] }
        ).rows[0];
        if (!revision) throw new Error('Workflow revision insert failed');
        await tx.execute(
          sql`UPDATE entry_workflow_current SET workflow_revision_id=${revision.id} WHERE organization_id=${ctx.organizationId} AND event_id=${eventId}`,
        );
        await tx.execute(
          sql`INSERT INTO entry_workflow_audit (organization_id,event_id,workflow_revision_id,actor,reason) VALUES (${ctx.organizationId},${eventId},${revision.id},${actor},${reason})`,
        );
        return map(revision);
      }),
  };
}
