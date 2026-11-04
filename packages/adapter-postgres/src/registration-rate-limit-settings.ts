import { and, eq } from 'drizzle-orm';
import type { RequestContext } from '@racepilot/core';
import type { Database } from './database.js';
import { events, organizations } from './schema/organization.js';
import {
  organizationPublicRegistrationRateLimitOverrides,
  eventPublicRegistrationRateLimitOverrides,
  publicRegistrationRateLimitOverrideAudit,
} from './schema/public-registration.js';

export function createPublicRegistrationRateLimitSettingsRepository(
  db: Database,
) {
  const organizationSettings = async (ctx: RequestContext) => {
    const [row] = await db
      .select({
        organizationLimit:
          organizationPublicRegistrationRateLimitOverrides.organizationLimit,
        eventLimit: organizationPublicRegistrationRateLimitOverrides.eventLimit,
        windowSeconds:
          organizationPublicRegistrationRateLimitOverrides.windowSeconds,
      })
      .from(organizationPublicRegistrationRateLimitOverrides)
      .where(
        eq(
          organizationPublicRegistrationRateLimitOverrides.organizationId,
          ctx.organizationId,
        ),
      );
    if (!row) return null;
    return {
      ...(row.organizationLimit !== null
        ? { organizationLimit: row.organizationLimit }
        : {}),
      ...(row.eventLimit !== null ? { eventLimit: row.eventLimit } : {}),
      ...(row.windowSeconds !== null
        ? { windowSeconds: row.windowSeconds }
        : {}),
    };
  };
  const eventSettings = async (ctx: RequestContext, eventId: string) => {
    const [row] = await db
      .select({
        eventLimit: eventPublicRegistrationRateLimitOverrides.eventLimit,
        windowSeconds: eventPublicRegistrationRateLimitOverrides.windowSeconds,
      })
      .from(eventPublicRegistrationRateLimitOverrides)
      .where(
        and(
          eq(
            eventPublicRegistrationRateLimitOverrides.organizationId,
            ctx.organizationId,
          ),
          eq(eventPublicRegistrationRateLimitOverrides.eventId, eventId),
        ),
      );
    if (!row) return null;
    return {
      ...(row.eventLimit !== null ? { eventLimit: row.eventLimit } : {}),
      ...(row.windowSeconds !== null
        ? { windowSeconds: row.windowSeconds }
        : {}),
    };
  };
  return {
    getOrganization: organizationSettings,
    getEvent: eventSettings,
    resolvePublicEvent: async (ctx: RequestContext, slug: string) => {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.slug, slug),
          ),
        );
      if (!event) return null;
      return {
        eventId: event.id,
        organization: await organizationSettings(ctx),
        event: await eventSettings(ctx, event.id),
      };
    },
    updateOrganization: async (
      ctx: RequestContext,
      settings: {
        organizationLimit?: number;
        eventLimit?: number;
        windowSeconds?: number;
      },
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [organization] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .for('update');
        if (!organization) throw new Error('Organization not found');
        const table = organizationPublicRegistrationRateLimitOverrides;
        const [before] = await tx
          .select()
          .from(table)
          .where(eq(table.organizationId, ctx.organizationId))
          .for('update');
        const after = Object.keys(settings).length ? settings : null;
        if (after) {
          await tx
            .insert(table)
            .values({ organizationId: ctx.organizationId, ...after })
            .onConflictDoUpdate({
              target: table.organizationId,
              set: after,
            });
        } else {
          await tx
            .delete(table)
            .where(eq(table.organizationId, ctx.organizationId));
        }
        await tx.insert(publicRegistrationRateLimitOverrideAudit).values({
          organizationId: ctx.organizationId,
          scope: 'organization',
          actor,
          beforeSettings: before
            ? {
                organizationLimit: before.organizationLimit,
                eventLimit: before.eventLimit,
                windowSeconds: before.windowSeconds,
              }
            : null,
          afterSettings: after ?? null,
        });
        return after;
      }),
    updateEvent: async (
      ctx: RequestContext,
      eventId: string,
      settings: { eventLimit?: number; windowSeconds?: number },
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [event] = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.id, eventId),
              eq(events.organizationId, ctx.organizationId),
            ),
          )
          .for('update');
        if (!event) return null;
        const table = eventPublicRegistrationRateLimitOverrides;
        const [before] = await tx
          .select()
          .from(table)
          .where(
            and(
              eq(table.organizationId, ctx.organizationId),
              eq(table.eventId, eventId),
            ),
          )
          .for('update');
        const after = Object.keys(settings).length ? settings : null;
        if (after) {
          await tx
            .insert(table)
            .values({
              organizationId: ctx.organizationId,
              eventId,
              ...after,
            })
            .onConflictDoUpdate({
              target: [table.organizationId, table.eventId],
              set: after,
            });
        } else {
          await tx
            .delete(table)
            .where(
              and(
                eq(table.organizationId, ctx.organizationId),
                eq(table.eventId, eventId),
              ),
            );
        }
        await tx.insert(publicRegistrationRateLimitOverrideAudit).values({
          organizationId: ctx.organizationId,
          eventId,
          scope: 'event',
          actor,
          beforeSettings: before
            ? {
                eventLimit: before.eventLimit,
                windowSeconds: before.windowSeconds,
              }
            : null,
          afterSettings: after ?? null,
        });
        return after;
      }),
  };
}
