import type { Database } from './database.js';

import type { EntryConfirmationRepository } from '@racepilot/core';

import { events, eventClasses } from './schema/organization.js';

import {
  people,
  vehicles,
  registrationGroups,
  entries,
} from './schema/entries.js';

import { invoices } from './schema/billing.js';

import { eq, and } from 'drizzle-orm';

import { sql } from 'drizzle-orm';

export function createEntryConfirmationRepository(
  db: Database,
): EntryConfirmationRepository {
  return {
    getByGroup: async (ctx, eventId, groupId) => {
      const rows = await db
        .select({
          eventName: events.name,
          eventStartsOn: events.startsOn,
          groupId: registrationGroups.id,
          driverFirst: people.firstName,
          driverLast: people.lastName,
          vehicleMake: vehicles.make,
          vehicleModel: vehicles.model,
          className: eventClasses.name,
          snapshot: entries.priceSnapshot,
          paymentReference: invoices.paymentReference,
        })
        .from(registrationGroups)
        .innerJoin(
          events,
          and(
            eq(events.organizationId, registrationGroups.organizationId),
            eq(events.id, registrationGroups.eventId),
          ),
        )
        .innerJoin(
          entries,
          and(
            eq(entries.organizationId, registrationGroups.organizationId),
            eq(entries.eventId, registrationGroups.eventId),
            eq(entries.registrationGroupId, registrationGroups.id),
            sql`${entries.deletedAt} is null`,
          ),
        )
        .innerJoin(
          people,
          and(
            eq(people.organizationId, entries.organizationId),
            eq(people.id, entries.driverPersonId),
            sql`${people.deletedAt} is null`,
          ),
        )
        .innerJoin(
          vehicles,
          and(
            eq(vehicles.organizationId, entries.organizationId),
            eq(vehicles.id, entries.vehicleId),
            sql`${vehicles.deletedAt} is null`,
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
        .leftJoin(
          invoices,
          and(
            eq(invoices.organizationId, registrationGroups.organizationId),
            eq(invoices.eventId, registrationGroups.eventId),
            eq(invoices.registrationGroupId, registrationGroups.id),
          ),
        )
        .where(
          and(
            eq(registrationGroups.organizationId, ctx.organizationId),
            eq(registrationGroups.eventId, eventId),
            eq(registrationGroups.id, groupId),
          ),
        );
      if (!rows.length || !rows[0]!.snapshot) return null;
      const snapshot = rows[0]!.snapshot;
      if (
        rows.some(
          (row) =>
            !row.snapshot ||
            row.snapshot.version !== snapshot.version ||
            row.snapshot.calculatedAt !== snapshot.calculatedAt ||
            row.snapshot.currency !== snapshot.currency ||
            row.snapshot.totalCents !== snapshot.totalCents,
        )
      )
        throw new Error('Registration group price snapshot mismatch');
      const reference = rows[0]!.paymentReference ?? '';
      return {
        eventId,
        eventName: rows[0]!.eventName,
        eventStartsOn: String(rows[0]!.eventStartsOn),
        registrationGroupId: rows[0]!.groupId,
        driverName: `${rows[0]!.driverFirst} ${rows[0]!.driverLast}`,
        vehicles: [
          ...new Set(
            rows.map((row) => `${row.vehicleMake} ${row.vehicleModel}`),
          ),
        ],
        classes: [...new Set(rows.map((row) => row.className))],
        priceSnapshot: snapshot,
        paymentReference: reference,
      };
    },
  };
}
