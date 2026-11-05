import type { Database } from './database.js';
import type { RequestContext } from '@racepilot/core';
import { eq, and } from 'drizzle-orm';
import { events } from './schema/organization.js';
import { eventConsentTermsAudit } from './schema/forms.js';

export function createEventConsentRepository(db: Database) {
  return {
    get: async (ctx: RequestContext, eventId: string) => {
      const [row] = await db
        .select({ terms: events.consentTerms })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .limit(1);
      return row?.terms ?? null;
    },
    update: async (
      ctx: RequestContext,
      eventId: string,
      terms: Array<{
        key: string;
        version: string;
        language: 'de' | 'en';
        text: string;
        hash: string;
      }>,
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [current] = await tx
          .select({ terms: events.consentTerms })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, eventId),
            ),
          )
          .for('update')
          .limit(1);
        if (!current) return null;
        const [row] = await tx
          .update(events)
          .set({ consentTerms: terms, updatedAt: new Date() })
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, eventId),
            ),
          )
          .returning({ terms: events.consentTerms });
        await tx.insert(eventConsentTermsAudit).values({
          organizationId: ctx.organizationId,
          eventId,
          actor,
          beforeTerms: current.terms,
          afterTerms: terms,
        });
        return row?.terms ?? null;
      }),
  };
}
