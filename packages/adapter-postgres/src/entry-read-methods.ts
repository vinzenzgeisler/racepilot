import { people, vehicles, entries } from './schema/entries.js';
import { eq, and, desc, asc, ilike, or, count } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { eventClasses } from './schema/organization.js';
import type { Database } from './database.js';
import type { EntryRepository } from '@racepilot/core';
import { attachAdminEntryDetails } from './entry-admin-details.js';
import { projectEntryRows } from './entry-projection.js';

export function createEntryReadMethods(
  db: Database,
): Required<Pick<EntryRepository, 'getById' | 'listAdmin'>> {
  return {
    getById: async (ctx, id) => {
      const [row] = await db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.id, id),
            sql`${entries.deletedAt} is null`,
          ),
        );
      return row
        ? (
            await attachAdminEntryDetails(
              db,
              ctx,
              await projectEntryRows(db, ctx, [row]),
            )
          )[0]!
        : null;
    },
    listAdmin: async (ctx, query) => {
      const predicates = [
        eq(entries.organizationId, ctx.organizationId),
        sql`${entries.deletedAt} is null`,
      ];
      if (query.eventId) predicates.push(eq(entries.eventId, query.eventId));
      if (query.classId) predicates.push(eq(entries.classId, query.classId));
      if (query.acceptanceStatus)
        predicates.push(eq(entries.acceptanceStatus, query.acceptanceStatus));
      if (query.verificationStatus)
        predicates.push(
          eq(entries.verificationStatus, query.verificationStatus),
        );
      if (query.paymentStatus === 'not_required')
        predicates.push(
          sql`not exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId})`,
        );
      else if (query.paymentStatus === 'not_relevant')
        predicates.push(
          sql`exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status = 'cancelled')`,
        );
      else if (query.paymentStatus)
        predicates.push(
          sql`exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status = ${query.paymentStatus})`,
        );
      const search = query.search?.trim();
      if (search) {
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
      }
      const where = and(...predicates);
      const sortColumns = {
        createdAt: entries.createdAt,
        requestedStartNumber: entries.requestedStartNumber,
        acceptanceStatus: entries.acceptanceStatus,
        verificationStatus: entries.verificationStatus,
      } as const;
      const sortColumn = sortColumns[query.sort];
      const [rows, totals] = await Promise.all([
        db
          .select({ entry: entries })
          .from(entries)
          .innerJoin(
            people,
            and(
              eq(people.id, entries.driverPersonId),
              eq(people.organizationId, entries.organizationId),
            ),
          )
          .innerJoin(
            vehicles,
            and(
              eq(vehicles.id, entries.vehicleId),
              eq(vehicles.organizationId, entries.organizationId),
            ),
          )
          .innerJoin(
            eventClasses,
            and(
              eq(eventClasses.id, entries.classId),
              eq(eventClasses.eventId, entries.eventId),
              eq(eventClasses.organizationId, entries.organizationId),
            ),
          )
          .where(where)
          .orderBy(
            query.direction === 'asc' ? asc(sortColumn) : desc(sortColumn),
            asc(entries.id),
          )
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db
          .select({ total: count() })
          .from(entries)
          .innerJoin(
            people,
            and(
              eq(people.id, entries.driverPersonId),
              eq(people.organizationId, entries.organizationId),
            ),
          )
          .innerJoin(
            vehicles,
            and(
              eq(vehicles.id, entries.vehicleId),
              eq(vehicles.organizationId, entries.organizationId),
            ),
          )
          .innerJoin(
            eventClasses,
            and(
              eq(eventClasses.id, entries.classId),
              eq(eventClasses.eventId, entries.eventId),
              eq(eventClasses.organizationId, entries.organizationId),
            ),
          )
          .where(where),
      ]);
      return {
        items: await attachAdminEntryDetails(
          db,
          ctx,
          await projectEntryRows(
            db,
            ctx,
            rows.map((row) => row.entry),
          ),
        ),
        total: totals[0]?.total ?? 0,
      };
    },
  };
}
