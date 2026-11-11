import { entries } from './schema/entries.js';
import { normalizeRequestedStartNumber } from '@racepilot/core';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { Database } from './database.js';
import type { EntryRepository } from '@racepilot/core';
import { mapEntry } from './entry-projection.js';
import { withAllocatedOrgaCode } from './orga-code.js';

export function createEntryWriteMethods(
  db: Database,
): Required<Pick<EntryRepository, 'create' | 'softDelete'>> {
  return {
    create: async (ctx, input, executor) =>
      withAllocatedOrgaCode(
        db,
        executor,
        ctx,
        input.eventId,
        async (tx, orgaCode) => {
          const [row] = await tx
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
              orgaCode,
              priceSnapshotVersion: input.priceSnapshotVersion,
              formSnapshotVersion: input.formSnapshotVersion,
              priceSnapshot: input.priceSnapshot ?? null,
            })
            .returning();
          return mapEntry(row!);
        },
      ),
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
