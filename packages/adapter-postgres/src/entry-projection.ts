import { entries } from './schema/entries.js';
import {
  organizationId,
  defaultEntryWorkflow,
  projectEntryStatuses,
  defaultEntryStatusDimensionConfig,
} from '@racepilot/core';
import type { Database } from './database.js';
import type { RequestContext } from '@racepilot/core';
import { sql } from 'drizzle-orm';
import {
  eventEntryStatusDimensionConfigs,
  entryStatusDimensionValues,
} from './schema/status.js';
import { eq, and, inArray } from 'drizzle-orm';
import { invoices } from './schema/billing.js';
import { events } from './schema/organization.js';

export function mapEntry(
  row: typeof entries.$inferSelect,
): import('@racepilot/core').Entry {
  return {
    id: row.id,
    eventId: row.eventId,
    classId: row.classId,
    registrationGroupId: row.registrationGroupId,
    driverPersonId: row.driverPersonId,
    vehicleId: row.vehicleId,
    requestedStartNumber: row.requestedStartNumber,
    priceSnapshotVersion: row.priceSnapshotVersion,
    formSnapshotVersion: row.formSnapshotVersion,
    priceSnapshot: row.priceSnapshot,
    deletionReason: row.deletionReason,
    organizationId: organizationId(row.organizationId),
    verificationStatus:
      row.verificationStatus as import('@racepilot/core').Entry['verificationStatus'],
    acceptanceStatus:
      row.acceptanceStatus as import('@racepilot/core').Entry['acceptanceStatus'],
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export async function projectEntryRows(
  db: Pick<Database, 'select' | 'execute'>,
  ctx: RequestContext,
  rows: readonly (typeof entries.$inferSelect)[],
): Promise<import('@racepilot/core').Entry[]> {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((row) => row.id))];
  const revisionIds = [
    ...new Set(
      rows
        .map((row) => row.workflowRevisionId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const eventIds = [...new Set(rows.map((row) => row.eventId))];
  const groupIds = [...new Set(rows.map((row) => row.registrationGroupId))];
  const inSql = (values: readonly string[]) =>
    sql`(${sql.join(
      values.map((value) => sql`${value}`),
      sql`, `,
    )})`;
  const [
    workflowResult,
    configs,
    states,
    invoiceRows,
    eventRows,
    starterResult,
  ] = await Promise.all([
    revisionIds.length
      ? db.execute(sql`
            SELECT id, workflow FROM entry_workflow_revision
            WHERE organization_id=${ctx.organizationId} AND id IN ${inSql(revisionIds)}
          `)
      : Promise.resolve({ rows: [] }),
    db
      .select({
        eventId: eventEntryStatusDimensionConfigs.eventId,
        config: eventEntryStatusDimensionConfigs.config,
      })
      .from(eventEntryStatusDimensionConfigs)
      .where(
        and(
          eq(
            eventEntryStatusDimensionConfigs.organizationId,
            ctx.organizationId,
          ),
          inArray(eventEntryStatusDimensionConfigs.eventId, eventIds),
        ),
      ),
    db
      .select({
        entryId: entryStatusDimensionValues.entryId,
        dimension: entryStatusDimensionValues.dimension,
        value: entryStatusDimensionValues.value,
      })
      .from(entryStatusDimensionValues)
      .where(
        and(
          eq(entryStatusDimensionValues.organizationId, ctx.organizationId),
          inArray(entryStatusDimensionValues.entryId, ids),
        ),
      ),
    db
      .select({
        registrationGroupId: invoices.registrationGroupId,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, ctx.organizationId),
          inArray(invoices.registrationGroupId, groupIds),
        ),
      ),
    db
      .select({
        id: events.id,
        registrationClosesAt: events.registrationClosesAt,
      })
      .from(events)
      .where(
        and(
          eq(events.organizationId, ctx.organizationId),
          inArray(events.id, eventIds),
        ),
      ),
    db.execute(sql`
        SELECT id, count(*) OVER (PARTITION BY event_id, driver_person_id) > 1 AS double_starter
        FROM entry WHERE organization_id=${ctx.organizationId}
          AND event_id IN ${inSql(eventIds)} AND deleted_at IS NULL
      `),
  ]);
  type WorkflowRow = {
    id: string;
    workflow: import('@racepilot/core').EntryWorkflow;
  };
  type StarterRow = { id: string; double_starter: boolean };
  const workflowMap = new Map(
    (workflowResult as unknown as { rows: WorkflowRow[] }).rows.map((row) => [
      row.id,
      row.workflow,
    ]),
  );
  const starterMap = new Map(
    (starterResult as unknown as { rows: StarterRow[] }).rows.map((row) => [
      row.id,
      row.double_starter,
    ]),
  );
  const configMap = new Map(configs.map((row) => [row.eventId, row.config]));
  const stateMap = new Map(
    states.map((row) => [`${row.entryId}:${row.dimension}`, row.value]),
  );
  const invoiceMap = new Map(
    invoiceRows.map((row) => [row.registrationGroupId, row.status]),
  );
  const closeMap = new Map(
    eventRows.map((row) => [row.id, row.registrationClosesAt]),
  );
  return rows.map((row) => {
    const rawHints = row.statusHints ?? {
      double_starter: false,
      passenger: false,
      late_entry: false,
    };
    const closesAt = closeMap.get(row.eventId);
    const hints = {
      double_starter:
        rawHints.double_starter || starterMap.get(row.id) === true,
      passenger: rawHints.passenger,
      late_entry:
        rawHints.late_entry || Boolean(closesAt && row.createdAt > closesAt),
    };
    const invoiceStatus = invoiceMap.get(row.registrationGroupId);
    const paymentStatus =
      invoiceStatus === undefined
        ? 'not_required'
        : invoiceStatus === 'cancelled'
          ? 'not_relevant'
          : invoiceStatus;
    const statusProjection = projectEntryStatuses({
      workflow:
        workflowMap.get(row.workflowRevisionId ?? '') ?? defaultEntryWorkflow,
      acceptanceStatus: row.acceptanceStatus,
      paymentStatus,
      technicalStatus:
        stateMap.get(`${row.id}:technical_inspection`) ?? 'not_relevant',
      waiverStatus: stateMap.get(`${row.id}:waiver`) ?? 'not_relevant',
      emailStatus: row.verificationStatus,
      config: configMap.get(row.eventId) ?? defaultEntryStatusDimensionConfig,
      hints,
    });
    return { ...mapEntry(row), statusProjection };
  });
}
