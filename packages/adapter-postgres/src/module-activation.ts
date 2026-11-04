import { and, eq } from 'drizzle-orm';
import type {
  ModuleActivationRepository,
  ModuleStateRecord,
  RequestContext,
} from '@racepilot/core';
import { uuidPattern } from './database.js';
import type { Database } from './database.js';
import { organizations, events } from './schema/organization.js';
import {
  organizationModules,
  eventModules,
  moduleActivationAudit,
} from './schema/modules.js';

const toModuleRecord = (row: {
  moduleId: string;
  enabled: boolean;
  config: unknown;
  version: number;
  moduleVersion: string;
  updatedBy: string;
  updatedAt: Date;
}): ModuleStateRecord => ({
  moduleId: row.moduleId,
  enabled: row.enabled,
  config: row.config,
  version: row.version,
  moduleVersion: row.moduleVersion,
  updatedAt: row.updatedAt,
  updatedBy: row.updatedBy,
});
export function createModuleActivationRepository(
  db: Database,
): ModuleActivationRepository {
  const orgRows = async (tx: Database, ctx: RequestContext) =>
    (
      await tx
        .select()
        .from(organizationModules)
        .where(eq(organizationModules.organizationId, ctx.organizationId))
    ).map(toModuleRecord);
  const eventRows = async (
    tx: Database,
    ctx: RequestContext,
    eventId: string,
  ) =>
    (
      await tx
        .select()
        .from(eventModules)
        .where(
          and(
            eq(eventModules.organizationId, ctx.organizationId),
            eq(eventModules.eventId, eventId),
          ),
        )
    ).map(toModuleRecord);
  const ownsEvent = async (
    tx: Database,
    ctx: RequestContext,
    eventId: string,
  ) =>
    (
      await tx
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
    ).length === 1;
  const snapshotOf = (r: ModuleStateRecord) => ({
    enabled: r.enabled,
    config: r.config,
    version: r.version,
    moduleVersion: r.moduleVersion,
  });
  return {
    listOrganization: (ctx) => orgRows(db, ctx),
    listEvent: async (ctx, eventId) => {
      if (!uuidPattern.test(eventId)) return null;
      return db.transaction(async (tx) => {
        const database = tx as unknown as Database;
        if (!(await ownsEvent(database, ctx, eventId))) return null;
        return {
          organization: await orgRows(database, ctx),
          event: await eventRows(database, ctx, eventId),
        };
      });
    },
    apply: async (ctx, scope, moduleId, decide) => {
      if (scope.level === 'event' && !uuidPattern.test(scope.eventId))
        return null;
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        // Organization row serializes org-level writers; events share it so an
        // event activation cannot race an organization-level disable.
        const lockOrg = tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId));
        await (scope.level === 'organization'
          ? lockOrg.for('update')
          : lockOrg.for('share'));
        if (scope.level === 'event') {
          const locked = await tx
            .select({ id: events.id })
            .from(events)
            .where(
              and(
                eq(events.organizationId, ctx.organizationId),
                eq(events.id, scope.eventId),
              ),
            )
            .for('update');
          if (locked.length !== 1) return null;
        }
        const organization = await orgRows(tx, ctx);
        const event =
          scope.level === 'event'
            ? await eventRows(tx, ctx, scope.eventId)
            : undefined;
        const before = (event ?? organization).find(
          (row) => row.moduleId === moduleId,
        );
        const write = decide({
          organization: new Map(organization.map((r) => [r.moduleId, r])),
          ...(event
            ? { event: new Map(event.map((r) => [r.moduleId, r])) }
            : {}),
        });
        if (!write) return null;
        const values = {
          organizationId: ctx.organizationId,
          moduleId,
          enabled: write.enabled,
          config: write.config,
          version: (before?.version ?? 0) + 1,
          moduleVersion: write.moduleVersion,
          updatedBy: write.actor,
          updatedAt: new Date(),
        };
        const [saved] =
          scope.level === 'event'
            ? await tx
                .insert(eventModules)
                .values({ ...values, eventId: scope.eventId })
                .onConflictDoUpdate({
                  target: [
                    eventModules.organizationId,
                    eventModules.eventId,
                    eventModules.moduleId,
                  ],
                  set: values,
                })
                .returning()
            : await tx
                .insert(organizationModules)
                .values(values)
                .onConflictDoUpdate({
                  target: [
                    organizationModules.organizationId,
                    organizationModules.moduleId,
                  ],
                  set: values,
                })
                .returning();
        const record = toModuleRecord(saved!);
        await tx.insert(moduleActivationAudit).values({
          organizationId: ctx.organizationId,
          eventId: scope.level === 'event' ? scope.eventId : null,
          moduleId,
          action: write.action,
          actor: write.actor,
          reason: write.reason ?? null,
          version: record.version,
          beforeState: before ? snapshotOf(before) : null,
          afterState: snapshotOf(record),
        });
        return record;
      });
    },
  };
}
