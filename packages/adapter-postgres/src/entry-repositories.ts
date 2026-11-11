import type { Database } from './database.js';

import { people, vehicles, entries } from './schema/entries.js';
import { eventClasses } from './schema/organization.js';
import { eq, and, ilike, or } from 'drizzle-orm';

import { sql } from 'drizzle-orm';

export function createEntryExportRepository(
  db: Database,
): import('@racepilot/core').EntryExportRepository {
  return {
    listByEvent: async (ctx, eventId, filters) => {
      const predicates = [
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, eventId),
        sql`${entries.deletedAt} is null`,
      ];
      if (filters.classId)
        predicates.push(eq(entries.classId, filters.classId));
      if (filters.acceptanceStatus)
        predicates.push(eq(entries.acceptanceStatus, filters.acceptanceStatus));
      if (filters.verificationStatus)
        predicates.push(
          eq(entries.verificationStatus, filters.verificationStatus),
        );
      if (filters.paymentStatus === 'not_required')
        predicates.push(
          sql`not exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId})`,
        );
      else if (filters.paymentStatus === 'not_relevant')
        predicates.push(
          sql`exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status = 'cancelled')`,
        );
      else if (filters.paymentStatus)
        predicates.push(
          sql`exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status = ${filters.paymentStatus})`,
        );
      const search = filters.search?.trim();
      if (search)
        for (const token of search.split(/\s+/)) {
          const pattern = `%${token.replace(/[\\%_]/g, '\\$&')}%`;
          predicates.push(
            or(
              ilike(entries.requestedStartNumber, pattern),
              sql`${entries.id}::text ilike ${pattern}`,
              ilike(people.firstName, pattern),
              ilike(people.lastName, pattern),
              ilike(vehicles.make, pattern),
              ilike(vehicles.model, pattern),
              ilike(vehicles.registration, pattern),
              ilike(eventClasses.name, pattern),
            )!,
          );
        }
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
        .where(and(...predicates));
      return rows.map((row) => ({
        driver: `${row.driverFirst} ${row.driverLast}`,
        vehicle: `${row.make} ${row.model}`,
        class: row.className,
        startNumber: row.startNumber,
        status: row.status,
        priceCents: row.priceSnapshot?.totalCents ?? null,
      }));
    },
  };
}
