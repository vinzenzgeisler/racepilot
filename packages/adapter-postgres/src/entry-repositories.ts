import type { Database } from './database.js';

import { people, vehicles, entries } from './schema/entries.js';
import { eventClasses } from './schema/organization.js';
import { eq, and } from 'drizzle-orm';

import { sql } from 'drizzle-orm';

export function createEntryExportRepository(
  db: Database,
): import('@racepilot/core').EntryExportRepository {
  return {
    listByEvent: async (ctx, eventId) => {
      const rows = await db
        .select({
          driverFirst: people.firstName,
          driverLast: people.lastName,
          make: vehicles.make,
          model: vehicles.model,
          className: eventClasses.name,
          startNumber: entries.requestedStartNumber,
          status: entries.acceptanceStatus,
          priceSnapshot: entries.priceSnapshot,
        })
        .from(entries)
        .innerJoin(
          people,
          and(
            eq(people.organizationId, entries.organizationId),
            eq(people.id, entries.driverPersonId),
          ),
        )
        .innerJoin(
          vehicles,
          and(
            eq(vehicles.organizationId, entries.organizationId),
            eq(vehicles.id, entries.vehicleId),
          ),
        )
        .innerJoin(
          eventClasses,
          and(
            eq(eventClasses.organizationId, entries.organizationId),
            eq(eventClasses.eventId, entries.eventId),
            eq(eventClasses.id, entries.classId),
          ),
        )
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.eventId, eventId),
            sql`${entries.deletedAt} is null`,
          ),
        );
      return rows.map((row) => ({
        driver: `${row.driverFirst} ${row.driverLast}`,
        vehicle: `${row.make} ${row.model}`,
        class: row.className,
        startNumber: row.startNumber,
        status: row.status as import('@racepilot/core').EntryAcceptanceStatus,
        priceCents: row.priceSnapshot?.totalCents ?? null,
      }));
    },
  };
}
