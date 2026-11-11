import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  type EntryAdminActionResult,
  type EntryAdminActionsRepository,
} from '@racepilot/core';
import type { Database } from './database.js';
import { entries } from './schema/entries.js';
import {
  entryAdminActionAuditEvents,
  entryNotes,
} from './schema/entry-admin.js';
import { changeClass } from './entry-admin-action-class.js';
import { adjustAmount } from './entry-admin-action-amount.js';
import { eventClasses } from './schema/organization.js';

export function createEntryAdminActionsRepository(
  db: Database,
): EntryAdminActionsRepository {
  return {
    availableActions: async (ctx, entryId) => {
      const [entry] = await db
        .select({
          eventId: entries.eventId,
          classId: entries.classId,
          deletedAt: entries.deletedAt,
          hasPrice: entries.priceSnapshot,
        })
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.id, entryId),
            sql`${entries.deletedAt} is null`,
          ),
        )
        .limit(1);
      if (!entry || entry.deletedAt) return [];
      const actions = ['note:internal', 'note:driver', 'delete'];
      if (entry.hasPrice) actions.push('adjust_amount');
      const classes = await db
        .select()
        .from(eventClasses)
        .where(
          and(
            eq(eventClasses.organizationId, ctx.organizationId),
            eq(eventClasses.eventId, entry.eventId),
            eq(eventClasses.closed, false),
            ne(eventClasses.id, entry.classId),
          ),
        );
      for (const target of classes) {
        if (target.maxParticipants === null)
          return [...actions, 'change_class'];
        const [occupancy] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.classId, target.id),
              sql`${entries.deletedAt} is null`,
              ne(entries.acceptanceStatus, 'withdrawn'),
            ),
          );
        if ((occupancy?.count ?? 0) < target.maxParticipants)
          return [...actions, 'change_class'];
      }
      return actions;
    },
    perform: async (ctx, entryId, action, actor) =>
      db.transaction(async (tx): Promise<EntryAdminActionResult> => {
        const [initial] = await tx
          .select()
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, entryId),
            ),
          )
          .limit(1);
        if (!initial) return { status: 'not_found' };
        let entry = initial;
        if (action.kind === 'change_class' || action.kind === 'adjust_amount') {
          const groupEntries = await tx
            .select()
            .from(entries)
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.registrationGroupId, initial.registrationGroupId),
              ),
            )
            .orderBy(asc(entries.id))
            .for('update');
          const current = groupEntries.find((item) => item.id === entryId);
          if (!current) return { status: 'not_found' };
          entry = current;
        } else {
          const [current] = await tx
            .select()
            .from(entries)
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.id, entryId),
              ),
            )
            .for('update')
            .limit(1);
          if (!current) return { status: 'not_found' };
          entry = current;
        }
        if (action.kind === 'note') {
          if (entry.deletedAt) return { status: 'not_found' };
          await tx.insert(entryNotes).values({
            organizationId: ctx.organizationId,
            entryId,
            visibility: action.visibility,
            body: action.text.trim(),
            actor,
          });
          return { status: 'updated' };
        }
        if (action.expectedVersion !== entry.revision)
          return { status: 'conflict', reason: 'stale' };
        if (action.kind === 'delete') {
          if (entry.deletedAt) return { status: 'not_found' };
          const deleted = true;
          await tx
            .update(entries)
            .set({
              deletedAt: deleted ? new Date() : null,
              deletionReason: deleted ? action.reason.trim() : null,
              revision: entry.revision + 1,
            })
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.id, entryId),
                eq(entries.revision, entry.revision),
              ),
            );
          await tx.insert(entryAdminActionAuditEvents).values({
            organizationId: ctx.organizationId,
            entryId,
            action: 'deleted',
            beforeValue: { deletedAt: null },
            afterValue: { deletedAt: true },
            actor,
            reason: action.reason.trim(),
          });
          return { status: 'updated' };
        }
        if (entry.deletedAt) return { status: 'not_found' };
        if (action.kind === 'change_class')
          return changeClass(tx, ctx.organizationId, entry, action, actor);
        return adjustAmount(tx, ctx.organizationId, entry, action, actor);
      }),
  };
}
