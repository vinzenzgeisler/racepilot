import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AdminEntryInvoice, RequestContext } from '@racepilot/core';
import type { Database } from './database.js';
import { invoices } from './schema/billing.js';

/** Invoice and paid amount per registration group; one invoice can cover several entries. */
export async function loadInvoiceSummaries(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  groupIds: string[],
): Promise<Map<string, AdminEntryInvoice>> {
  const rows = await db
    .select({
      groupId: invoices.registrationGroupId,
      id: invoices.id,
      paymentReference: invoices.paymentReference,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      status: invoices.status,
      paidCents: sql<number>`coalesce((select sum(p.amount_cents) from invoice_payment p where p.organization_id = invoice.organization_id and p.invoice_id = invoice.id), 0)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, ctx.organizationId),
        inArray(invoices.registrationGroupId, groupIds),
      ),
    );
  return new Map(
    rows.map(({ groupId, ...invoice }) => [
      groupId,
      { ...invoice, status: invoice.status as AdminEntryInvoice['status'] },
    ]),
  );
}
