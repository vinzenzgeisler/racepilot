import { and, eq, notExists, sql } from 'drizzle-orm';
import {
  resolveCanonicalOrigin,
  type CanonicalOrigin,
  type RequestContext,
} from '@racepilot/core';
import type { Database, TransactionDatabase } from './database.js';
import { entries, people } from './schema/entries.js';
import { events } from './schema/organization.js';
import { entryPassengerLinks, entryPassengers } from './schema/passengers.js';
import { issuePassengerLink } from './passenger-link.js';

/**
 * Sends the co-drivers named in a registration their personal link, once the driver's e-mail
 * address is verified. A registration that names an address nobody confirmed never triggers mail.
 * Co-drivers that already have a link (also an expired one) are left to the office.
 */
export async function issueRegistrationPassengerLinks(
  db: Database,
  tx: TransactionDatabase,
  ctx: RequestContext,
  input: { canonicalOrigin: CanonicalOrigin; registrationGroupId: string },
): Promise<void> {
  const origin = await resolveCanonicalOrigin(input.canonicalOrigin, ctx);
  if (!origin) return;
  const pending = await tx
    .select({
      passenger: entryPassengers,
      entryId: entries.id,
      eventName: events.name,
      driverFirstName: people.firstName,
      driverLastName: people.lastName,
    })
    .from(entryPassengers)
    .innerJoin(
      entries,
      and(
        eq(entries.organizationId, entryPassengers.organizationId),
        eq(entries.id, entryPassengers.entryId),
      ),
    )
    .innerJoin(
      events,
      and(
        eq(events.organizationId, entries.organizationId),
        eq(events.id, entries.eventId),
      ),
    )
    .innerJoin(
      people,
      and(
        eq(people.organizationId, entries.organizationId),
        eq(people.id, entries.driverPersonId),
      ),
    )
    .where(
      and(
        eq(entryPassengers.organizationId, ctx.organizationId),
        eq(entries.registrationGroupId, input.registrationGroupId),
        sql`${entries.deletedAt} is null`,
        sql`${entryPassengers.email} is not null`,
        sql`${entryPassengers.completedAt} is null`,
        notExists(
          tx
            .select({ one: sql`1` })
            .from(entryPassengerLinks)
            .where(
              and(
                eq(
                  entryPassengerLinks.organizationId,
                  entryPassengers.organizationId,
                ),
                eq(entryPassengerLinks.passengerId, entryPassengers.id),
              ),
            ),
        ),
      ),
    );
  for (const row of pending)
    await issuePassengerLink(
      db,
      tx,
      {
        organizationId: ctx.organizationId,
        eventId: row.passenger.eventId,
        passengerId: row.passenger.id,
        entryId: row.entryId,
        firstName: row.passenger.firstName,
        lastName: row.passenger.lastName,
        email: row.passenger.email,
        language: row.passenger.language,
        driverName: `${row.driverFirstName} ${row.driverLastName}`,
        eventName: row.eventName,
      },
      origin,
      'System',
    );
}
