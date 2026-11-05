import type { RequestContext } from '@racepilot/core';
import { normalizeRequestedStartNumber } from '@racepilot/core';
import { events } from './schema/organization.js';
import { eq, and } from 'drizzle-orm';
import { entries } from './schema/entries.js';
import { sql } from 'drizzle-orm';
import type { PublicRegistrationDependencies } from './registration-public-types.js';

export function createRegistrationStartNumberMethods(
  dependencies: PublicRegistrationDependencies,
) {
  const { db } = dependencies;
  return {
    checkRequestedStartNumber: async (
      ctx: RequestContext,
      eventSlug: string,
      input: string,
    ) => {
      let number: string;
      try {
        number = normalizeRequestedStartNumber(input)!;
      } catch {
        return { available: false };
      }
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.slug, eventSlug),
            eq(events.status, 'open'),
          ),
        )
        .limit(1);
      if (!event) return null;
      const [existing] = await db
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.eventId, event.id),
            eq(entries.requestedStartNumber, number),
            sql`${entries.deletedAt} is null`,
            sql`${entries.acceptanceStatus} <> 'withdrawn'`,
          ),
        )
        .limit(1);
      return { available: !existing };
    },
  };
}
