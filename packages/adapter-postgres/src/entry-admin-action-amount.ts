import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  EntryAdminAction,
  EntryAdminActionResult,
  PriceSnapshot,
} from '@racepilot/core';
import type { Database } from './database.js';
import { entries } from './schema/entries.js';
import {
  entryAdminActionAuditEvents,
  entryAmountAdjustments,
} from './schema/entry-admin.js';
import { updateInvoice } from './entry-admin-action-invoice.js';

export async function adjustAmount(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  organizationId: string,
  entry: typeof entries.$inferSelect,
  action: Extract<EntryAdminAction, { kind: 'adjust_amount' }>,
  actor: string,
): Promise<EntryAdminActionResult> {
  const snapshot = entry.priceSnapshot;
  if (!snapshot) return { status: 'conflict', reason: 'class' };
  const previous = snapshot.totalCents;
  const updatedSnapshot: PriceSnapshot = {
    ...snapshot,
    calculatedAt: new Date().toISOString(),
    totalCents: action.amountCents,
  };
  const groupEntries = await tx
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, organizationId),
        eq(entries.registrationGroupId, entry.registrationGroupId),
        sql`${entries.deletedAt} is null`,
      ),
    )
    .orderBy(asc(entries.id))
    .for('update');
  for (const item of groupEntries)
    await tx.insert(entryAdminActionAuditEvents).values({
      organizationId,
      entryId: item.id,
      action: 'amount_adjusted',
      beforeValue: { amountCents: previous },
      afterValue: { amountCents: action.amountCents },
      actor,
      reason: action.reason.trim(),
    });
  for (const item of groupEntries)
    await tx
      .update(entries)
      .set({
        priceSnapshot: updatedSnapshot,
        revision:
          item.id === entry.id
            ? entry.revision + 1
            : sql`${entries.revision} + 1`,
      })
      .where(
        and(
          eq(entries.organizationId, organizationId),
          eq(entries.id, item.id),
        ),
      );
  await tx.insert(entryAmountAdjustments).values({
    organizationId,
    entryId: entry.id,
    originalCents: previous,
    adjustedCents: action.amountCents,
    actor,
    reason: action.reason.trim(),
  });
  await updateInvoice(
    tx,
    organizationId,
    entry.registrationGroupId,
    action.amountCents - previous,
  );
  return { status: 'updated' };
}
