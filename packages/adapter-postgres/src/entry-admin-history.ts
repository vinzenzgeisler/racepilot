import { registrationGroups, entries } from './schema/entries.js';
import {
  entryAuditEvents,
  entryDataAuditEvents,
} from './schema/entry-audit.js';
import {
  entryAdminActionAuditEvents,
  entryNotes,
} from './schema/entry-admin.js';
import { eq, and, inArray } from 'drizzle-orm';
import {
  organizationMemberships,
  userIdentities,
} from './schema/organization.js';
import { entryStatusDimensionAudit } from './schema/status.js';
import {
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
} from './schema/billing.js';
import { emailOutbox } from './mail-schema.js';
import { loadPassengerHistory } from './passenger-history.js';
import type { Database } from './database.js';
import type { RequestContext } from '@racepilot/core';

export async function loadEntryAdminHistory(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  ids: string[],
) {
  const [
    entryAudits,
    dimensionAudits,
    paymentAudits,
    mailRows,
    dataAudits,
    actionAudits,
    notes,
    passengerHistory,
  ] = await Promise.all([
    db
      .select()
      .from(entryAuditEvents)
      .where(
        and(
          eq(entryAuditEvents.organizationId, ctx.organizationId),
          inArray(entryAuditEvents.entryId, ids),
        ),
      ),
    db
      .select()
      .from(entryStatusDimensionAudit)
      .where(
        and(
          eq(entryStatusDimensionAudit.organizationId, ctx.organizationId),
          inArray(entryStatusDimensionAudit.entryId, ids),
        ),
      ),
    db
      .select({
        entryId: entries.id,
        id: invoicePaymentAuditEvents.id,
        action: invoicePaymentAuditEvents.action,
        actor: invoicePaymentAuditEvents.actor,
        reason: invoicePaymentAuditEvents.reason,
        occurredAt: invoicePaymentAuditEvents.occurredAt,
      })
      .from(invoicePaymentAuditEvents)
      .innerJoin(
        invoicePayments,
        and(
          eq(invoicePayments.id, invoicePaymentAuditEvents.paymentId),
          eq(invoicePayments.organizationId, ctx.organizationId),
        ),
      )
      .innerJoin(
        invoices,
        and(
          eq(invoices.id, invoicePayments.invoiceId),
          eq(invoices.organizationId, ctx.organizationId),
        ),
      )
      .innerJoin(
        registrationGroups,
        and(
          eq(registrationGroups.id, invoices.registrationGroupId),
          eq(registrationGroups.organizationId, ctx.organizationId),
        ),
      )
      .innerJoin(
        entries,
        and(
          eq(entries.registrationGroupId, registrationGroups.id),
          eq(entries.organizationId, ctx.organizationId),
        ),
      )
      .where(
        and(
          eq(invoicePaymentAuditEvents.organizationId, ctx.organizationId),
          inArray(entries.id, ids),
        ),
      ),
    db
      .select({
        entryId: entries.id,
        id: emailOutbox.id,
        status: emailOutbox.status,
        templateKey: emailOutbox.templateKey,
        recipient: emailOutbox.recipient,
        createdAt: emailOutbox.createdAt,
        sentAt: emailOutbox.sentAt,
      })
      .from(emailOutbox)
      .innerJoin(
        registrationGroups,
        and(
          eq(registrationGroups.organizationId, emailOutbox.organizationId),
          eq(registrationGroups.id, emailOutbox.registrationGroupId),
          eq(registrationGroups.eventId, emailOutbox.eventId),
        ),
      )
      .innerJoin(
        entries,
        and(
          eq(entries.organizationId, registrationGroups.organizationId),
          eq(entries.registrationGroupId, registrationGroups.id),
          eq(entries.eventId, emailOutbox.eventId),
        ),
      )
      .where(
        and(
          eq(emailOutbox.organizationId, ctx.organizationId),
          inArray(entries.id, ids),
        ),
      ),
    db
      .select()
      .from(entryDataAuditEvents)
      .where(
        and(
          eq(entryDataAuditEvents.organizationId, ctx.organizationId),
          inArray(entryDataAuditEvents.entryId, ids),
        ),
      ),
    db
      .select()
      .from(entryAdminActionAuditEvents)
      .where(
        and(
          eq(entryAdminActionAuditEvents.organizationId, ctx.organizationId),
          inArray(entryAdminActionAuditEvents.entryId, ids),
        ),
      ),
    db
      .select()
      .from(entryNotes)
      .where(
        and(
          eq(entryNotes.organizationId, ctx.organizationId),
          inArray(entryNotes.entryId, ids),
        ),
      ),
    loadPassengerHistory(db, ctx, ids),
  ]);
  type Item = {
    id: string;
    kind: 'entry' | 'status' | 'payment' | 'email';
    label: string;
    actor: string;
    detail: string;
  };
  const historyByEntry = new Map<
    string,
    Array<Item & { occurredAt: string }>
  >();
  const appendHistory = (
    entryId: string,
    item: Item & { occurredAt: Date | string },
  ) => {
    const list = historyByEntry.get(entryId) ?? [];
    list.push({ ...item, occurredAt: new Date(item.occurredAt).toISOString() });
    historyByEntry.set(entryId, list);
  };
  for (const row of entryAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'entry',
      label: `${row.transition}: ${row.fromStatus} → ${row.toStatus}`,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: row.reason,
    });
  for (const row of dataAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'entry',
      label: `data: ${row.subject}${row.copiedFromId ? ' (copy)' : ''}`,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: Object.keys(row.changes).join(','),
    });
  for (const row of dimensionAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'status',
      label: `${row.dimension}: ${row.fromValue} → ${row.toValue}`,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: row.reason,
    });
  for (const row of actionAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'entry',
      label: row.action,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: row.reason,
    });
  for (const row of notes)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'entry',
      label: row.visibility === 'internal' ? 'internal_note' : 'driver_note',
      actor: row.actor,
      occurredAt: row.createdAt,
      detail: row.body,
    });
  for (const row of paymentAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'payment',
      label: row.action,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: row.reason,
    });
  for (const row of mailRows)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'email',
      label: `${row.templateKey}: ${row.status}`,
      actor: 'System',
      occurredAt: row.sentAt ?? row.createdAt,
      detail: row.recipient,
    });
  for (const { entryId, ...item } of passengerHistory)
    appendHistory(entryId, { ...item, kind: 'entry' });
  await resolveActorNames(db, ctx, historyByEntry);
  for (const items of historyByEntry.values())
    items.sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt),
    );
  return historyByEntry;
}

const actorPattern = /^(.+)[#|]([^#|]+)$/;

/** Replaces stored `issuer#subject` actors with the member's display name when one is known. */
async function resolveActorNames(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  history: Map<string, Array<{ actor: string }>>,
) {
  const subjects = new Set<string>();
  for (const list of history.values())
    for (const item of list) {
      const match = actorPattern.exec(item.actor);
      if (match) subjects.add(match[2]!);
    }
  if (!subjects.size) return;
  const members = await db
    .select({
      issuer: userIdentities.issuer,
      subject: userIdentities.subject,
      displayName: userIdentities.displayName,
      email: userIdentities.email,
    })
    .from(userIdentities)
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userIdentityId, userIdentities.id),
        eq(organizationMemberships.organizationId, ctx.organizationId),
      ),
    )
    .where(inArray(userIdentities.subject, [...subjects]));
  const names = new Map<string, string>(
    members.flatMap((member) => {
      const name = member.displayName?.trim() || member.email?.trim();
      return name
        ? [
            [`${member.issuer}#${member.subject}`, name] as const,
            [`${member.issuer}|${member.subject}`, name] as const,
          ]
        : [];
    }),
  );
  for (const list of history.values())
    for (const item of list) item.actor = names.get(item.actor) ?? item.actor;
}
