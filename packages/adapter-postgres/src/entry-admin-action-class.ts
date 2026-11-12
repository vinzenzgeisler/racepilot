import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  calculatePrice,
  type EntryAdminAction,
  type EntryAdminActionResult,
  type PriceSnapshot,
} from '@racepilot/core';
import type { Database } from './database.js';
import { entries } from './schema/entries.js';
import { entryAdminActionAuditEvents } from './schema/entry-admin.js';
import { eventClassPricingRules } from './schema/billing.js';
import { eventClasses, organizations } from './schema/organization.js';
import { updateInvoice } from './entry-admin-action-invoice.js';

export async function changeClass(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  organizationId: string,
  entry: typeof entries.$inferSelect,
  action: Extract<EntryAdminAction, { kind: 'change_class' }>,
  actor: string,
): Promise<EntryAdminActionResult> {
  const [target] = await tx
    .select()
    .from(eventClasses)
    .where(
      and(
        eq(eventClasses.organizationId, organizationId),
        eq(eventClasses.id, action.classId),
        eq(eventClasses.eventId, entry.eventId),
      ),
    )
    .for('update')
    .limit(1);
  if (!target || target.closed) return { status: 'conflict', reason: 'class' };
  const [occupancy] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, organizationId),
        eq(entries.classId, target.id),
        ne(entries.id, entry.id),
        sql`${entries.deletedAt} is null`,
        ne(entries.acceptanceStatus, 'withdrawn'),
      ),
    );
  if (
    target.maxParticipants !== null &&
    (occupancy?.count ?? 0) >= target.maxParticipants
  )
    return { status: 'conflict', reason: 'capacity' };
  const groupEntries = await tx
    .select()
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
  const quantities = new Map<string, number>();
  for (const item of groupEntries) {
    const classId = item.id === entry.id ? target.id : item.classId;
    quantities.set(classId, (quantities.get(classId) ?? 0) + 1);
  }
  const rules = await tx
    .select()
    .from(eventClassPricingRules)
    .where(
      and(
        eq(eventClassPricingRules.organizationId, organizationId),
        eq(eventClassPricingRules.eventId, entry.eventId),
      ),
    );
  let snapshot: PriceSnapshot | null = null;
  if (rules.length > 0) {
    const rulesByClass = new Map(rules.map((rule) => [rule.classId, rule]));
    const lines = [...quantities].map(([classId, quantity]) => {
      const rule = rulesByClass.get(classId);
      if (!rule) return null;
      return {
        classId,
        quantity,
        rule: {
          classId,
          baseCents: rule.baseCents,
          additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
          earlyBirdDeadline: rule.earlyBirdDeadline?.toISOString() ?? null,
          earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
        },
      };
    });
    if (lines.some((line) => line === null))
      return { status: 'conflict', reason: 'class' };
    const [org] = await tx
      .select({ currency: organizations.currency })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!org) return { status: 'not_found' };
    snapshot = calculatePrice({
      currency: org.currency,
      submittedAt: new Date().toISOString(),
      lines: lines.filter((line) => line !== null),
    });
  }
  const previousTotal = entry.priceSnapshot?.totalCents ?? null;
  for (const groupEntry of groupEntries)
    await tx.insert(entryAdminActionAuditEvents).values({
      organizationId,
      entryId: groupEntry.id,
      action: 'class_changed',
      beforeValue: {
        classId: groupEntry.classId,
        priceCents: groupEntry.priceSnapshot?.totalCents ?? null,
      },
      afterValue: {
        classId: groupEntry.id === entry.id ? target.id : groupEntry.classId,
        priceCents:
          snapshot?.totalCents ?? groupEntry.priceSnapshot?.totalCents ?? null,
      },
      actor,
      reason: action.reason.trim(),
    });
  await tx
    .update(entries)
    .set({
      classId: target.id,
      ...(snapshot
        ? { priceSnapshotVersion: snapshot.version, priceSnapshot: snapshot }
        : {}),
      revision: entry.revision + 1,
    })
    .where(
      and(
        eq(entries.organizationId, organizationId),
        eq(entries.id, entry.id),
        eq(entries.revision, entry.revision),
      ),
    );
  for (const groupEntry of groupEntries)
    if (groupEntry.id !== entry.id && snapshot)
      await tx
        .update(entries)
        .set({
          priceSnapshotVersion: snapshot.version,
          priceSnapshot: snapshot,
          revision: sql`${entries.revision} + 1`,
        })
        .where(
          and(
            eq(entries.organizationId, organizationId),
            eq(entries.id, groupEntry.id),
          ),
        );
  if (snapshot && previousTotal !== null)
    await updateInvoice(
      tx,
      organizationId,
      entry.registrationGroupId,
      snapshot.totalCents - previousTotal,
    );
  return { status: 'updated' };
}
