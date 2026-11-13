import { and, eq, ne, sql } from 'drizzle-orm';
import type { EntryDetailRepository, RequestContext } from '@racepilot/core';
import type { Database } from './database.js';
import {
  entries,
  people,
  registrationGroups,
  vehicles,
} from './schema/entries.js';
import { entryDataAuditEvents } from './schema/entry-audit.js';
import { listEntryMessages } from './entry-messages.js';

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
      registrationGroupId: entries.registrationGroupId,
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

const identityKeys = ['firstName', 'lastName', 'dateOfBirth', 'country'];
const pick = (source: object, keys: string[], include: boolean) =>
  Object.fromEntries(
    Object.entries(source).filter(([key]) => keys.includes(key) === include),
  );

type Changes = Record<string, { from: Scalar; to: Scalar }>;

/** One audit row per entry the change applies to, so no affected entry is left without a trace. */
async function auditEntries(
  tx: Tx,
  ctx: RequestContext,
  entryIds: string[],
  subject: 'driver' | 'vehicle',
  changes: Changes,
  actor: string,
  copiedFromId: string | null = null,
) {
  await tx.insert(entryDataAuditEvents).values(
    entryIds.map((entryId) => ({
      organizationId: ctx.organizationId,
      entryId,
      subject,
      changes,
      actor,
      copiedFromId,
    })),
  );
}

export function createEntryDetailRepository(
  db: Database,
): EntryDetailRepository {
  return {
    /**
     * Contact data is stored on the registration and applies to its entries only.
     * Name, birth date and country live on the organization-wide person: they change only
     * while no other registration uses that person, otherwise the request is refused.
     */
    updateDriver: async (ctx, entryId, patch, actor) => {
      requireWrite(ctx);
      if (!actor.trim()) throw new Error('Actor is required');
      return db.transaction(async (tx) => {
        const entry = await loadEntry(tx, ctx, entryId);
        if (!entry) return 'not_found';
        const [group] = await tx
          .select()
          .from(registrationGroups)
          .where(
            and(
              eq(registrationGroups.organizationId, ctx.organizationId),
              eq(registrationGroups.id, entry.registrationGroupId),
            ),
          )
          .for('update')
          .limit(1);
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
        if (!group || !person) return 'not_found';
        const identityChanges = diff(person, pick(patch, identityKeys, true));
        const contactChanges = diff(group, pick(patch, identityKeys, false));
        if (
          !Object.keys(identityChanges).length &&
          !Object.keys(contactChanges).length
        )
          return 'updated';
        if (Object.keys(identityChanges).length) {
          const [other] = await tx
            .select({ id: entries.id })
            .from(entries)
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.driverPersonId, person.id),
                ne(entries.registrationGroupId, group.id),
              ),
            )
            .limit(1);
          if (other) return 'person_shared';
          await tx
            .update(people)
            .set(pick(patch, identityKeys, true))
            .where(
              and(
                eq(people.organizationId, ctx.organizationId),
                eq(people.id, person.id),
              ),
            );
        }
        if (Object.keys(contactChanges).length)
          await tx
            .update(registrationGroups)
            .set(pick(patch, identityKeys, false))
            .where(
              and(
                eq(registrationGroups.organizationId, ctx.organizationId),
                eq(registrationGroups.id, group.id),
              ),
            );
        const mates = await tx
          .select({ id: entries.id })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.registrationGroupId, group.id),
              sql`${entries.deletedAt} is null`,
            ),
          );
        await auditEntries(
          tx,
          ctx,
          mates.map((mate) => mate.id),
          'driver',
          { ...identityChanges, ...contactChanges },
          actor,
        );
        return 'updated';
      });
    },
    /** A vehicle used by several entries is copied for this entry; the others keep the original. */
    updateVehicle: async (ctx, entryId, patch, actor) => {
      requireWrite(ctx);
      if (!actor.trim()) throw new Error('Actor is required');
      return db.transaction(async (tx) => {
        const entry = await loadEntry(tx, ctx, entryId);
        if (!entry) return 'not_found';
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
        if (!vehicle) return 'not_found';
        const changes = diff(vehicle, patch);
        if (!Object.keys(changes).length) return 'updated';
        const [shared] = await tx
          .select({ id: entries.id })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.vehicleId, vehicle.id),
              ne(entries.id, entryId),
            ),
          )
          .limit(1);
        if (shared) {
          const { id, createdAt, ...fields } = vehicle;
          void id;
          void createdAt;
          const [copy] = await tx
            .insert(vehicles)
            .values({ ...fields, ...patch })
            .returning({ id: vehicles.id });
          await tx
            .update(entries)
            .set({ vehicleId: copy!.id })
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.id, entryId),
              ),
            );
          await auditEntries(
            tx,
            ctx,
            [entryId],
            'vehicle',
            changes,
            actor,
            vehicle.id,
          );
          return 'updated';
        }
        await tx
          .update(vehicles)
          .set(patch)
          .where(
            and(
              eq(vehicles.organizationId, ctx.organizationId),
              eq(vehicles.id, vehicle.id),
            ),
          );
        await auditEntries(tx, ctx, [entryId], 'vehicle', changes, actor);
        return 'updated';
      });
    },
    listMessages: (ctx, entryId) => listEntryMessages(db, ctx, entryId),
  };
}
