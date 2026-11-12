import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './database.js';
import { invoices, invoicePayments } from './schema/billing.js';

export async function updateInvoice(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  organizationId: string,
  registrationGroupId: string,
  difference: number,
): Promise<void> {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.registrationGroupId, registrationGroupId),
      ),
    )
    .for('update')
    .limit(1);
  if (!invoice) return;
  const [paid] = await tx
    .select({
      amount: sql<number>`coalesce(sum(${invoicePayments.amountCents}), 0)::int`,
    })
    .from(invoicePayments)
    .where(
      and(
        eq(invoicePayments.organizationId, organizationId),
        eq(invoicePayments.invoiceId, invoice.id),
      ),
    );
  const totalCents = Math.max(0, invoice.totalCents + difference);
  const paidCents = paid?.amount ?? 0;
  await tx
    .update(invoices)
    .set({
      totalCents,
      status:
        paidCents >= totalCents
          ? 'paid'
          : paidCents > 0
            ? 'partially_paid'
            : 'open',
    })
    .where(eq(invoices.id, invoice.id));
}
