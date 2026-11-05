import type { Database } from './database.js';
import { events } from './schema/organization.js';
import { eq, and } from 'drizzle-orm';
import {
  eventEntryStatusDimensionConfigs,
  entryStatusDimensionValues,
  eventEntryStatusDimensionConfigAudit,
} from './schema/status.js';
import {
  defaultEntryStatusDimensionConfig,
  validateEntryStatusDimensionConfig,
  EntryStatusInUseError,
} from '@racepilot/core';

export function createEntryStatusConfigRepository(
  db: Database,
): Pick<
  import('@racepilot/core').EntryStatusDimensionRepository,
  'getEvent' | 'setEvent'
> {
  return {
    getEvent: async (ctx, eventId) => {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .limit(1);
      if (!event) return null;
      const [row] = await db
        .select({ config: eventEntryStatusDimensionConfigs.config })
        .from(eventEntryStatusDimensionConfigs)
        .where(
          and(
            eq(
              eventEntryStatusDimensionConfigs.organizationId,
              ctx.organizationId,
            ),
            eq(eventEntryStatusDimensionConfigs.eventId, eventId),
          ),
        )
        .limit(1);
      return row?.config ?? defaultEntryStatusDimensionConfig;
    },
    setEvent: async (ctx, eventId, config, actor, reason) => {
      if (!ctx.permissions.has('event:write')) throw new Error('Forbidden');
      if (!actor.trim() || !reason.trim())
        throw new Error('Actor and reason are required');
      const errors = validateEntryStatusDimensionConfig(config);
      if (errors.length)
        throw new Error(
          `Invalid status dimension config: ${errors.join('; ')}`,
        );
      return db.transaction(async (tx) => {
        const [event] = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, eventId),
            ),
          )
          .for('update')
          .limit(1);
        if (!event) return null;
        const [old] = await tx
          .select({ config: eventEntryStatusDimensionConfigs.config })
          .from(eventEntryStatusDimensionConfigs)
          .where(
            and(
              eq(
                eventEntryStatusDimensionConfigs.organizationId,
                ctx.organizationId,
              ),
              eq(eventEntryStatusDimensionConfigs.eventId, eventId),
            ),
          )
          .limit(1);
        const stateRows = await tx
          .select({
            dimension: entryStatusDimensionValues.dimension,
            value: entryStatusDimensionValues.value,
          })
          .from(entryStatusDimensionValues)
          .where(
            and(
              eq(entryStatusDimensionValues.organizationId, ctx.organizationId),
              eq(entryStatusDimensionValues.eventId, eventId),
            ),
          );
        for (const state of stateRows) {
          const dimension = config.dimensions.find(
            (item) => item.key === state.dimension,
          );
          if (!dimension?.values.some((item) => item.key === state.value))
            throw new EntryStatusInUseError(
              state.dimension as import('@racepilot/core').EntryStatusDimensionKey,
              state.value,
            );
        }
        await tx
          .insert(eventEntryStatusDimensionConfigs)
          .values({
            organizationId: ctx.organizationId,
            eventId,
            config,
            actor: actor.trim(),
            reason: reason.trim(),
          })
          .onConflictDoUpdate({
            target: [
              eventEntryStatusDimensionConfigs.organizationId,
              eventEntryStatusDimensionConfigs.eventId,
            ],
            set: {
              config,
              actor: actor.trim(),
              reason: reason.trim(),
              updatedAt: new Date(),
            },
          });
        await tx.insert(eventEntryStatusDimensionConfigAudit).values({
          organizationId: ctx.organizationId,
          eventId,
          beforeConfig: old?.config ?? null,
          afterConfig: config,
          actor: actor.trim(),
          reason: reason.trim(),
        });
        return config;
      });
    },
  };
}
