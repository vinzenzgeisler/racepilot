import { and, desc, eq, sql } from 'drizzle-orm';
import type { EntryMessage, RequestContext } from '@racepilot/core';
import type { Database } from './database.js';
import { entries } from './schema/entries.js';
import { emailOutbox, emailTemplateVersions } from './mail-schema.js';
import { events } from './schema/organization.js';
import { renderOutboxSubject } from './mail-subject.js';

/** Mails created for the entry's registration; null when the entry is not in the caller's organization. */
export async function listEntryMessages(
  db: Database,
  ctx: RequestContext,
  entryId: string,
): Promise<EntryMessage[] | null> {
  if (!ctx.permissions.has('entry:read')) throw new Error('Forbidden');
  const [entry] = await db
    .select({
      groupId: entries.registrationGroupId,
      eventId: entries.eventId,
      eventName: events.name,
    })
    .from(entries)
    .innerJoin(
      events,
      and(
        eq(events.id, entries.eventId),
        eq(events.organizationId, entries.organizationId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.id, entryId),
        sql`${entries.deletedAt} is null`,
      ),
    )
    .limit(1);
  if (!entry) return null;
  const rows = await db
    .select({
      id: emailOutbox.id,
      status: emailOutbox.status,
      templateKey: emailOutbox.templateKey,
      locale: emailOutbox.locale,
      recipient: emailOutbox.recipient,
      variables: emailOutbox.variables,
      createdAt: emailOutbox.createdAt,
      sentAt: emailOutbox.sentAt,
      subjectTemplate: emailTemplateVersions.subject,
    })
    .from(emailOutbox)
    .leftJoin(
      emailTemplateVersions,
      and(
        eq(emailTemplateVersions.organizationId, emailOutbox.organizationId),
        eq(emailTemplateVersions.id, emailOutbox.templateVersionId),
      ),
    )
    .where(
      and(
        eq(emailOutbox.organizationId, ctx.organizationId),
        eq(emailOutbox.registrationGroupId, entry.groupId),
        eq(emailOutbox.eventId, entry.eventId),
      ),
    )
    .orderBy(desc(emailOutbox.createdAt))
    .limit(100);
  return rows.map((row): EntryMessage => ({
    id: row.id,
    status: row.status as EntryMessage['status'],
    subject: renderOutboxSubject(
      row.templateKey,
      row.locale,
      row.subjectTemplate,
      { eventName: entry.eventName, ...row.variables },
    ),
    templateKey: row.templateKey,
    recipient: row.recipient,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  }));
}
