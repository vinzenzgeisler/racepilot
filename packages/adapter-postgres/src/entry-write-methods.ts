import { entries } from './schema/entries.js';
import { normalizeRequestedStartNumber } from '@racepilot/core';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { Database } from './database.js';
import type { EntryRepository } from '@racepilot/core';
import { mapEntry } from './entry-projection.js';

export function createEntryWriteMethods(
  db: Database,
): Required<Pick<EntryRepository, 'create' | 'softDelete'>> {
  return {
    create: async (ctx, input, executor) => {
      const executorDb = (executor as Database | undefined) ?? db;
      const [row] = await executorDb
        .insert(entries)
        .values({
          organizationId: ctx.organizationId,
          eventId: input.eventId,
          classId: input.classId,
          registrationGroupId: input.registrationGroupId,
          driverPersonId: input.driverPersonId,
          vehicleId: input.vehicleId,
          acceptanceStatus: 'pending',
          requestedStartNumber: normalizeRequestedStartNumber(
            input.requestedStartNumber,
          ),
          priceSnapshotVersion: input.priceSnapshotVersion,
          formSnapshotVersion: input.formSnapshotVersion,
          priceSnapshot: input.priceSnapshot ?? null,
        })
        .returning();
      return mapEntry(row!);
    },
    softDelete: async (ctx, id, reason) => {
      const [row] = await db
        .update(entries)
        .set({ deletedAt: new Date(), deletionReason: reason })
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.id, id),
            sql`${entries.deletedAt} is null`,
          ),
        )
        .returning();
      return row ? mapEntry(row) : null;
    },
  };
}
