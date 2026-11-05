import type { Database } from './database.js';

import type {
  EventClassPricingRepository,
  InvoiceRepository,
  InvoiceRecord,
} from '@racepilot/core';

import {
  eventClassPricingRules,
  invoiceReferenceCounters,
  invoices,
} from './schema/billing.js';

import { eq, and } from 'drizzle-orm';

import { sql } from 'drizzle-orm';

import { organizationId, createPaymentReference } from '@racepilot/core';

export function createEventClassPricingRepository(
  db: Database,
): EventClassPricingRepository {
  return {
    listByEvent: async (ctx, eventId) =>
      (
        await db
          .select()
          .from(eventClassPricingRules)
          .where(
            and(
              eq(eventClassPricingRules.organizationId, ctx.organizationId),
              eq(eventClassPricingRules.eventId, eventId),
            ),
          )
      ).map((r) => ({
        classId: r.classId,
        baseCents: r.baseCents,
        additionalEntryAdjustmentCents: r.additionalEntryAdjustmentCents,
        earlyBirdDeadline: r.earlyBirdDeadline?.toISOString() ?? null,
        earlyBirdDiscountCents: r.earlyBirdDiscountCents,
      })),
    upsert: async (ctx, eventId, rule) => {
      const [r] = await db
        .insert(eventClassPricingRules)
        .values({
          organizationId: ctx.organizationId,
          eventId,
          classId: rule.classId,
          baseCents: rule.baseCents,
          additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
          earlyBirdDeadline: rule.earlyBirdDeadline
            ? new Date(rule.earlyBirdDeadline)
            : null,
          earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
        })
        .onConflictDoUpdate({
          target: [
            eventClassPricingRules.organizationId,
            eventClassPricingRules.eventId,
            eventClassPricingRules.classId,
          ],
          set: {
            baseCents: rule.baseCents,
            additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
            earlyBirdDeadline: rule.earlyBirdDeadline
              ? new Date(rule.earlyBirdDeadline)
              : null,
            earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
            updatedAt: new Date(),
          },
        })
        .returning();
      return {
        classId: r!.classId,
        baseCents: r!.baseCents,
        additionalEntryAdjustmentCents: r!.additionalEntryAdjustmentCents,
        earlyBirdDeadline: r!.earlyBirdDeadline?.toISOString() ?? null,
        earlyBirdDiscountCents: r!.earlyBirdDiscountCents,
      };
    },
  };
}

export function createInvoiceRepository(db: Database): InvoiceRepository {
  return {
    issue: async (ctx, eventId, registrationGroupId, snapshot, executor) => {
      const executorDb = (executor as Database | undefined) ?? db;
      const [counter] = await executorDb
        .insert(invoiceReferenceCounters)
        .values({ organizationId: ctx.organizationId, nextValue: 1 })
        .onConflictDoUpdate({
          target: invoiceReferenceCounters.organizationId,
          set: { nextValue: sql`${invoiceReferenceCounters.nextValue} + 1` },
        })
        .returning({ nextValue: invoiceReferenceCounters.nextValue });
      const paymentReference = createPaymentReference(
        String(counter!.nextValue).padStart(8, '0'),
      );
      const [row] = await executorDb
        .insert(invoices)
        .values({
          organizationId: ctx.organizationId,
          eventId,
          registrationGroupId,
          totalCents: snapshot.totalCents,
          currency: snapshot.currency,
          paymentReference,
        })
        .onConflictDoNothing({
          target: [invoices.organizationId, invoices.registrationGroupId],
        })
        .returning();
      const invoice =
        row ??
        (
          await executorDb
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.organizationId, ctx.organizationId),
                eq(invoices.registrationGroupId, registrationGroupId),
              ),
            )
        )[0];
      if (!invoice) throw new Error('Invoice creation failed');
      if (
        invoice.totalCents !== snapshot.totalCents ||
        invoice.currency !== snapshot.currency
      )
        throw new Error('Existing invoice does not match price snapshot');
      return {
        ...invoice,
        organizationId: organizationId(invoice.organizationId),
        status: invoice.status as InvoiceRecord['status'],
      };
    },
  };
}
