import { createEntryStatusConfigRepository } from './entry-status-config.js';
import type { Database } from './database.js';

import { events } from './schema/organization.js';

import { eq, and } from 'drizzle-orm';

import {
  eventEntryStatusDimensionConfigs,
  entryStatusDimensionValues,
  entryStatusDimensionAudit,
  entryStatusHintsAudit,
} from './schema/status.js';

import { defaultEntryStatusDimensionConfig } from '@racepilot/core';

import { entries } from './schema/entries.js';

import { sql } from 'drizzle-orm';

import type { EntryStatusHintKey } from '@racepilot/core';

export function createEntryStatusDimensionRepository(
  db: Database,
): import('@racepilot/core').EntryStatusDimensionRepository {
  return {
    ...createEntryStatusConfigRepository(db),
    transition: async (ctx, entryId, dimension, to, actor, reason) => {
      if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
      if (!actor.trim() || !reason.trim())
        throw new Error('Actor and reason are required');
      return db.transaction(async (tx) => {
        // Match setEvent's lock order: serialize on the event, then lock the entry.
        // event_id is immutable; this unlocked lookup only discovers the lock key.
        const [identity] = await tx
          .select({ eventId: entries.eventId })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, entryId),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .limit(1);
        if (!identity) return null;
        const [event] = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, identity.eventId),
            ),
          )
          .for('update')
          .limit(1);
        if (!event) return null;
        const [entry] = await tx
          .select({ eventId: entries.eventId })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.eventId, event.id),
              eq(entries.id, entryId),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .for('update')
          .limit(1);
        if (!entry) return null;
        const [configured] = await tx
          .select({ config: eventEntryStatusDimensionConfigs.config })
          .from(eventEntryStatusDimensionConfigs)
          .where(
            and(
              eq(
                eventEntryStatusDimensionConfigs.organizationId,
                ctx.organizationId,
              ),
              eq(eventEntryStatusDimensionConfigs.eventId, entry.eventId),
            ),
          )
          .limit(1);
        const config = configured?.config ?? defaultEntryStatusDimensionConfig;
        const definition = config.dimensions.find(
          (item) => item.key === dimension,
        );
        const target = definition?.values.find((item) => item.key === to);
        if (!definition || !target) throw new Error('Unknown status value');
        const [current] = await tx
          .select({ value: entryStatusDimensionValues.value })
          .from(entryStatusDimensionValues)
          .where(
            and(
              eq(entryStatusDimensionValues.organizationId, ctx.organizationId),
              eq(entryStatusDimensionValues.entryId, entryId),
              eq(entryStatusDimensionValues.dimension, dimension),
            ),
          )
          .limit(1);
        const from =
          current?.value ?? (dimension === 'waiver' ? 'f_pending' : 'pending');
        if (
          !definition.transitions.some(
            (edge) => edge.from === from && edge.to === to,
          )
        )
          throw new Error(`Invalid ${dimension} transition: ${from} -> ${to}`);
        await tx
          .insert(entryStatusDimensionValues)
          .values({
            organizationId: ctx.organizationId,
            eventId: entry.eventId,
            entryId,
            dimension,
            value: to,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              entryStatusDimensionValues.organizationId,
              entryStatusDimensionValues.entryId,
              entryStatusDimensionValues.dimension,
            ],
            set: { value: to, updatedAt: new Date() },
          });
        await tx.insert(entryStatusDimensionAudit).values({
          organizationId: ctx.organizationId,
          eventId: entry.eventId,
          entryId,
          dimension,
          fromValue: from,
          toValue: to,
          actor: actor.trim(),
          reason: reason.trim(),
        });
        return true;
      });
    },
    updateHints: async (ctx, entryId, hints, actor, reason) => {
      if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
      if (!actor.trim() || !reason.trim())
        throw new Error('Actor and reason are required');
      const allowed = new Set<EntryStatusHintKey>([
        'double_starter',
        'passenger',
        'late_entry',
      ]);
      if (
        !Object.keys(hints).length ||
        Object.entries(hints).some(
          ([key, value]) =>
            !allowed.has(key as EntryStatusHintKey) ||
            typeof value !== 'boolean',
        )
      )
        throw new Error('Invalid status hint');
      return db.transaction(async (tx) => {
        const [entry] = await tx
          .select({ eventId: entries.eventId, hints: entries.statusHints })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, entryId),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .for('update')
          .limit(1);
        if (!entry) return false;
        const after = { ...entry.hints, ...hints };
        await tx
          .update(entries)
          .set({ statusHints: after })
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, entryId),
            ),
          );
        await tx.insert(entryStatusHintsAudit).values({
          organizationId: ctx.organizationId,
          eventId: entry.eventId,
          entryId,
          beforeHints: entry.hints,
          afterHints: after,
          actor: actor.trim(),
          reason: reason.trim(),
        });
        return true;
      });
    },
  };
}
