import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  EntryDetailRepository,
  EntryMessage,
  RequestContext,
} from '@racepilot/core';
import type { Database } from './database.js';
import {
  entries,
  entryDataAuditEvents,
  people,
  vehicles,
} from './schema/entries.js';
import { emailOutbox, emailTemplateVersions } from './mail-schema.js';
import { events } from './schema/organization.js';
import { renderOutboxSubject } from './mail-subject.js';

type Scalar = string | number | null;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

function requireWrite(ctx: RequestContext) {
  if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
}

async function loadEntry(tx: Tx, ctx: RequestContext, entryId: string) {
  const [row] = await tx
    .select({
      driverPersonId: entries.driverPersonId,
      vehicleId: entries.vehicleId,
    })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.id, entryId),
        sql`${entries.deletedAt} is null`,
      ),
    )
    .for('update')
    .limit(1);
  return row ?? null;
}

function diff(current: object, patch: object) {
  const changes: Record<string, { from: Scalar; to: Scalar }> = {};
  for (const [key, to] of Object.entries(patch) as Array<
    [string, Scalar | undefined]
  >)
    if (to !== undefined && (current as Record<string, unknown>)[key] !== to)
      changes[key] = {
        from: ((current as Record<string, unknown>)[key] as Scalar) ?? null,
        to,
      };
  return changes;
}

export function createEntryDetailRepository(
  db: Database,
): EntryDetailRepository {
  return {
    updateDriver: async (ctx, entryId, patch, actor) => {
      requireWrite(ctx);
      if (!actor.trim()) throw new Error('Actor is required');
      return db.transaction(async (tx) => {
        const entry = await loadEntry(tx, ctx, entryId);
        if (!entry) return false;
        const [person] = await tx
          .select()
          .from(people)
          .where(
            and(
              eq(people.organizationId, ctx.organizationId),
              eq(people.id, entry.driverPersonId),
            ),
          )
          .for('update')
          .limit(1);
        if (!person) return false;
        const changes = diff(person, patch);
        if (!Object.keys(changes).length) return true;
        await tx
          .update(people)
          .set(patch)
          .where(
            and(
              eq(people.organizationId, ctx.organizationId),
              eq(people.id, person.id),
            ),
          );
        await tx.insert(entryDataAuditEvents).values({
          organizationId: ctx.organizationId,
          entryId,
          subject: 'driver',
          changes,
          actor,
        });
        return true;
      });
    },
    updateVehicle: async (ctx, entryId, patch, actor) => {
      requireWrite(ctx);
      if (!actor.trim()) throw new Error('Actor is required');
      return db.transaction(async (tx) => {
        const entry = await loadEntry(tx, ctx, entryId);
        if (!entry) return false;
        const [vehicle] = await tx
          .select()
          .from(vehicles)
          .where(
            and(
              eq(vehicles.organizationId, ctx.organizationId),
              eq(vehicles.id, entry.vehicleId),
            ),
          )
          .for('update')
          .limit(1);
        if (!vehicle) return false;
        const changes = diff(vehicle, patch);
        if (!Object.keys(changes).length) return true;
        await tx
          .update(vehicles)
          .set(patch)
          .where(
            and(
              eq(vehicles.organizationId, ctx.organizationId),
              eq(vehicles.id, vehicle.id),
            ),
          );
        await tx.insert(entryDataAuditEvents).values({
          organizationId: ctx.organizationId,
          entryId,
          subject: 'vehicle',
          changes,
          actor,
        });
        return true;
      });
    },
    listMessages: async (ctx, entryId) => {
      if (!ctx.permissions.has('entry:read')) throw new Error('Forbidden');
      const [entry] = await db
        .select({
          groupId: entries.registrationGroupId,
          eventId: entries.eventId,
          eventName: events.name,
        })
        .from(entries)
        .innerJoin(
          events,
          and(
            eq(events.id, entries.eventId),
            eq(events.organizationId, entries.organizationId),
          ),
        )
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.id, entryId),
            sql`${entries.deletedAt} is null`,
          ),
        )
        .limit(1);
      if (!entry) return null;
      const rows = await db
        .select({
          id: emailOutbox.id,
          status: emailOutbox.status,
          templateKey: emailOutbox.templateKey,
          locale: emailOutbox.locale,
          recipient: emailOutbox.recipient,
          variables: emailOutbox.variables,
          createdAt: emailOutbox.createdAt,
          sentAt: emailOutbox.sentAt,
          subjectTemplate: emailTemplateVersions.subject,
        })
        .from(emailOutbox)
        .leftJoin(
          emailTemplateVersions,
          and(
            eq(
              emailTemplateVersions.organizationId,
              emailOutbox.organizationId,
            ),
            eq(emailTemplateVersions.id, emailOutbox.templateVersionId),
          ),
        )
        .where(
          and(
            eq(emailOutbox.organizationId, ctx.organizationId),
            eq(emailOutbox.registrationGroupId, entry.groupId),
            eq(emailOutbox.eventId, entry.eventId),
          ),
        )
        .orderBy(desc(emailOutbox.createdAt))
        .limit(100);
      return rows.map((row): EntryMessage => ({
        id: row.id,
        status: row.status as EntryMessage['status'],
        subject: renderOutboxSubject(
          row.templateKey,
          row.locale,
          row.subjectTemplate,
          { eventName: entry.eventName, ...row.variables },
        ),
        templateKey: row.templateKey,
        recipient: row.recipient,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
      }));
    },
  };
}
