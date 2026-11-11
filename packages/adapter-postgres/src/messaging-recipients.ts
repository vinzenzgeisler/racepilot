import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { MessageRecipientFilter } from '@racepilot/contracts';
import type {
  MessageRecipientCandidate,
  RequestContext,
} from '@racepilot/core';
import { deduplicateMessageRecipients } from '@racepilot/core';
import type { Database } from './database.js';
import { entries, people, registrationGroups } from './schema/entries.js';
import { eventClasses, events } from './schema/organization.js';

export async function resolveMessageRecipients(
  db: Database,
  ctx: RequestContext,
  eventId: string,
  filter: MessageRecipientFilter,
) {
  const eventRows = await db
    .select({ id: events.id, name: events.name })
    .from(events)
    .where(
      and(
        eq(events.id, eventId),
        eq(events.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);
  const event = eventRows[0];
  if (!event) return null;
  const where = [
    eq(entries.organizationId, ctx.organizationId),
    eq(entries.eventId, eventId),
    isNull(entries.deletedAt),
  ];
  if (filter.classIds.length)
    where.push(inArray(entries.classId, filter.classIds));
  const verification = filter.statuses.filter(
    (status) => status === 'verified' || status === 'unverified',
  );
  const acceptance = filter.statuses.filter((status) =>
    ['pending', 'accepted', 'rejected', 'withdrawn'].includes(status),
  );
  if (verification.length)
    where.push(inArray(entries.verificationStatus, verification));
  if (acceptance.length)
    where.push(inArray(entries.acceptanceStatus, acceptance));
  if (filter.emailVerified !== undefined)
    where.push(
      eq(
        entries.verificationStatus,
        filter.emailVerified ? 'verified' : 'unverified',
      ),
    );
  if (filter.payment === 'paid')
    where.push(
      sql`exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status = 'paid')`,
    );
  if (filter.payment === 'open')
    where.push(
      sql`exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status in ('open','partially_paid'))`,
    );
  if (filter.payment === 'unpaid')
    where.push(
      sql`not exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status in ('paid','partially_paid'))`,
    );
  if (filter.entryIds.length) where.push(inArray(entries.id, filter.entryIds));
  const rows = await db
    .select({
      address: sql<
        string | null
      >`coalesce(${registrationGroups.contactEmail}, ${registrationGroups.guardianEmail}, ${people.email})`,
      entryId: entries.id,
      registrationGroupId: registrationGroups.id,
      firstName: people.firstName,
      lastName: people.lastName,
      eventName: events.name,
      className: eventClasses.name,
      entryNumber: entries.requestedStartNumber,
    })
    .from(entries)
    .innerJoin(
      registrationGroups,
      and(
        eq(registrationGroups.organizationId, entries.organizationId),
        eq(registrationGroups.eventId, entries.eventId),
        eq(registrationGroups.id, entries.registrationGroupId),
      ),
    )
    .innerJoin(
      people,
      and(
        eq(people.organizationId, entries.organizationId),
        eq(people.id, entries.driverPersonId),
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
    .innerJoin(
      events,
      and(
        eq(events.organizationId, entries.organizationId),
        eq(events.id, entries.eventId),
      ),
    )
    .where(and(...where))
    .orderBy(entries.createdAt);
  const candidates: MessageRecipientCandidate[] = rows.map((row) => ({
    address: row.address,
    entryId: row.entryId,
    registrationGroupId: row.registrationGroupId,
    firstName: row.firstName,
    lastName: row.lastName,
    eventName: row.eventName,
    className: row.className,
    entryNumber: row.entryNumber ?? '',
  }));
  const unique = deduplicateMessageRecipients(
    candidates,
    filter.additionalAddresses,
  );
  return {
    count: unique.length,
    recipients: unique.map((recipient) => ({
      entryId: recipient.entryId || null,
      registrationGroupId: recipient.registrationGroupId ?? null,
      email: recipient.address,
      name: `${recipient.firstName} ${recipient.lastName}`.trim(),
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      fullName: `${recipient.firstName} ${recipient.lastName}`.trim(),
      eventName: recipient.eventName || event.name,
      className: recipient.className,
      entryNumber: recipient.entryNumber,
    })),
  };
}
