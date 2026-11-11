import { and, eq, isNull, sql } from 'drizzle-orm';
import type {
  MessageRecipientCandidate,
  MessageRecipientFilter,
  RequestContext,
} from '@racepilot/core';
import { resolveMessageRecipientCandidates } from '@racepilot/core';
import type { Database, TransactionDatabase } from './database.js';
import { entries, people, registrationGroups } from './schema/entries.js';
import { eventClasses, events } from './schema/organization.js';

export async function resolveMessageRecipients(
  db: Database | TransactionDatabase,
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
  const rows = await db
    .select({
      address: sql<
        string | null
      >`coalesce(${registrationGroups.contactEmail}, ${registrationGroups.guardianEmail}, ${people.email})`,
      entryId: entries.id,
      classId: entries.classId,
      verificationStatus: entries.verificationStatus,
      acceptanceStatus: entries.acceptanceStatus,
      paymentStatus: sql<'paid' | 'open' | 'unpaid'>`case
        when exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status = 'paid') then 'paid'
        when exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status in ('open','partially_paid')) then 'open'
        else 'unpaid'
      end`,
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
    classId: row.classId,
    verificationStatus: row.verificationStatus,
    acceptanceStatus: row.acceptanceStatus,
    paymentStatus: row.paymentStatus,
    registrationGroupId: row.registrationGroupId,
    firstName: row.firstName,
    lastName: row.lastName,
    eventName: row.eventName,
    className: row.className,
    entryNumber: row.entryNumber ?? '',
  }));
  const unique = resolveMessageRecipientCandidates(candidates, filter);
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
