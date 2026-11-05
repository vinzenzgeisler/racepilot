import {
  registrationGroups,
  entries,
  entryAuditEvents,
} from './schema/entries.js';
import { eq, and, inArray } from 'drizzle-orm';
import { entryStatusDimensionAudit } from './schema/status.js';
import {
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
} from './schema/billing.js';
import { emailOutbox } from './mail-schema.js';
import type { Database } from './database.js';
import type { RequestContext } from '@racepilot/core';

export async function loadEntryAdminHistory(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  ids: string[],
) {
  const [entryAudits, dimensionAudits, paymentAudits, mailRows] =
    await Promise.all([
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
    ]);
  const historyByEntry = new Map<
    string,
    Array<{
      id: string;
      kind: 'entry' | 'status' | 'payment' | 'email';
      label: string;
      actor: string;
      occurredAt: string;
      detail: string;
    }>
  >();
  const appendHistory = (
    entryId: string,
    item: {
      id: string;
      kind: 'entry' | 'status' | 'payment' | 'email';
      label: string;
      actor: string;
      occurredAt: Date | string;
      detail: string;
    },
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
  for (const row of dimensionAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'status',
      label: `${row.dimension}: ${row.fromValue} → ${row.toValue}`,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: row.reason,
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
  return historyByEntry;
}
