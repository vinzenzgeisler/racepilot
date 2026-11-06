import { and, count, eq, isNull } from 'drizzle-orm';
import type { Database } from './database.js';
import type { EntryRepository } from '@racepilot/core';
import { entries } from './schema/entries.js';
import { events } from './schema/organization.js';

export function createEntryCountMethods(
  db: Database,
): Required<Pick<EntryRepository, 'countByStatus'>> {
  return {
    countByStatus: async (ctx, eventId) => {
      const rows = await db
        .select({ status: entries.acceptanceStatus, total: count() })
        .from(entries)
        .innerJoin(
          events,
          and(
            eq(events.organizationId, entries.organizationId),
            eq(events.id, entries.eventId),
          ),
        )
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.eventId, eventId),
            isNull(entries.deletedAt),
          ),
        )
        .groupBy(entries.acceptanceStatus);
      return Object.fromEntries(rows.map((row) => [row.status, row.total]));
    },
  };
}
