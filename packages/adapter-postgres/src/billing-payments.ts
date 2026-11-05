import type { Database } from './database.js';

import type {
  InvoicePaymentRepository,
  PaymentRecipientRepository,
  PaymentRecipient,
} from '@racepilot/core';

import {
  organizationPaymentRecipients,
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
} from './schema/billing.js';

import { eq, and } from 'drizzle-orm';

import { sql } from 'drizzle-orm';

import { deriveInvoiceStatus } from '@racepilot/core';

export function createInvoicePaymentRepository(
  db: Database,
): InvoicePaymentRepository {
  return {
    record: async (ctx, invoiceId, amountCents, actor, reason) =>
      db.transaction(async (tx) => {
        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, invoiceId),
            ),
          )
          .for('update');
        if (!invoice || invoice.status === 'cancelled') return null;
        const [payment] = await tx
          .insert(invoicePayments)
          .values({
            organizationId: ctx.organizationId,
            invoiceId,
            amountCents,
            actor,
            reason,
          })
          .returning();
        await tx.insert(invoicePaymentAuditEvents).values({
          organizationId: ctx.organizationId,
          paymentId: payment!.id,
          action: 'recorded',
          actor,
          reason,
        });
        const sums = await tx
          .select({
            total: sql<number>`coalesce(sum(${invoicePayments.amountCents}),0)`,
          })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.invoiceId, invoiceId),
            ),
          );
        const status = deriveInvoiceStatus(
          invoice.totalCents,
          Number(sums[0]?.total ?? 0),
        );
        await tx
          .update(invoices)
          .set({ status })
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, invoiceId),
            ),
          );
        return payment;
      }),
    correct: async (ctx, paymentId, actor, reason) =>
      db.transaction(async (tx) => {
        const [original] = await tx
          .select()
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.id, paymentId),
            ),
          )
          .for('update');
        if (!original || original.reversesPaymentId !== null) return null;
        const [alreadyReversed] = await tx
          .select({ id: invoicePayments.id })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.reversesPaymentId, paymentId),
            ),
          )
          .limit(1);
        if (alreadyReversed) return null;
        const [reversal] = await tx
          .insert(invoicePayments)
          .values({
            organizationId: ctx.organizationId,
            invoiceId: original.invoiceId,
            amountCents: -original.amountCents,
            reversesPaymentId: original.id,
            actor,
            reason,
          })
          .returning();
        await tx.insert(invoicePaymentAuditEvents).values({
          organizationId: ctx.organizationId,
          paymentId: reversal!.id,
          action: 'reversal',
          actor,
          reason,
        });
        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, original.invoiceId),
            ),
          );
        const sums = await tx
          .select({
            total: sql<number>`coalesce(sum(${invoicePayments.amountCents}),0)`,
          })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.invoiceId, original.invoiceId),
            ),
          );
        if (invoice)
          await tx
            .update(invoices)
            .set({
              status: deriveInvoiceStatus(
                invoice.totalCents,
                Number(sums[0]?.total ?? 0),
              ),
            })
            .where(
              and(
                eq(invoices.organizationId, ctx.organizationId),
                eq(invoices.id, original.invoiceId),
              ),
            );
        return reversal;
      }),
  };
}

export function createPaymentRecipientRepository(
  db: Database,
): PaymentRecipientRepository {
  return {
    get: async (ctx) => {
      const [row] = await db
        .select()
        .from(organizationPaymentRecipients)
        .where(
          eq(organizationPaymentRecipients.organizationId, ctx.organizationId),
        );
      return row
        ? { accountName: row.accountName, iban: row.iban, bic: row.bic }
        : null;
    },
    set: async (ctx, recipient: PaymentRecipient) => {
      const [row] = await db
        .insert(organizationPaymentRecipients)
        .values({
          organizationId: ctx.organizationId,
          accountName: recipient.accountName,
          iban: recipient.iban,
          bic: recipient.bic ?? null,
        })
        .onConflictDoUpdate({
          target: organizationPaymentRecipients.organizationId,
          set: {
            accountName: recipient.accountName,
            iban: recipient.iban,
            bic: recipient.bic ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return { accountName: row!.accountName, iban: row!.iban, bic: row!.bic };
    },
  };
}
