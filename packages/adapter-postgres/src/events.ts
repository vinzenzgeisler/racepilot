import type { Database } from './database.js';

import type {
  EventRepository,
  EventClassRepository,
  Event,
  EventClass,
  EventStatus,
  EventInput,
  EventPatch,
  EventClassInput,
  EventSetupInput,
  EventSetupRepository,
} from '@racepilot/core';

import { events, eventClasses } from './schema/organization.js';
import { eventClassPricingRules } from './schema/billing.js';
import { eventConsentTermsAudit } from './schema/forms.js';

import { organizationId } from '@racepilot/core';

import { eq, and } from 'drizzle-orm';

import { sql } from 'drizzle-orm';

export function createEventRepository(db: Database): EventRepository {
  const mapEvent = (row: typeof events.$inferSelect): Event => ({
    id: row.id,
    organizationId: organizationId(row.organizationId),
    slug: row.slug,
    orgaCodePrefix: row.orgaCodePrefix,
    name: row.name,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    status: row.status as EventStatus,
    registrationOpensAt: row.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: row.registrationClosesAt?.toISOString() ?? null,
    openedAt: row.openedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  });
  return {
    listByOrganization: async (ctx) =>
      (
        await db
          .select()
          .from(events)
          .where(eq(events.organizationId, ctx.organizationId))
      ).map(mapEvent),
    getById: async (ctx, eventId) => {
      const [row] = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.id, eventId),
            eq(events.organizationId, ctx.organizationId),
          ),
        );
      return row ? mapEvent(row) : null;
    },
    getPublicBySlug: async (ctx, slug, now) => {
      const [row] = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.slug, slug),
            eq(events.status, 'open'),
            sql`(${events.registrationOpensAt} is null or ${events.registrationOpensAt} <= ${now})`,
            sql`(${events.registrationClosesAt} is null or ${events.registrationClosesAt} >= ${now})`,
          ),
        );
      if (!row) return null;
      const event = mapEvent(row);
      const [classes] = await Promise.all([
        createEventClassRepository(db).listByEvent(ctx, event.id),
      ]);
      return { ...event, classes };
    },
    create: async (ctx, input: EventInput) => {
      const [row] = await db
        .insert(events)
        .values({
          organizationId: ctx.organizationId,
          ...input,
          orgaCodePrefix: input.orgaCodePrefix?.trim().toUpperCase() ?? null,
          registrationOpensAt: input.registrationOpensAt
            ? new Date(input.registrationOpensAt)
            : null,
          registrationClosesAt: input.registrationClosesAt
            ? new Date(input.registrationClosesAt)
            : null,
        })
        .returning();
      return mapEvent(row!);
    },
    update: async (ctx, eventId, patch: EventPatch) => {
      const [row] = await db
        .update(events)
        .set({
          ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
          ...(patch.orgaCodePrefix !== undefined
            ? {
                orgaCodePrefix:
                  patch.orgaCodePrefix?.trim().toUpperCase() ?? null,
              }
            : {}),
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.startsOn !== undefined ? { startsOn: patch.startsOn } : {}),
          ...(patch.endsOn !== undefined ? { endsOn: patch.endsOn } : {}),
          ...('registrationOpensAt' in patch
            ? {
                registrationOpensAt: patch.registrationOpensAt
                  ? new Date(patch.registrationOpensAt)
                  : null,
              }
            : {}),
          ...('registrationClosesAt' in patch
            ? {
                registrationClosesAt: patch.registrationClosesAt
                  ? new Date(patch.registrationClosesAt)
                  : null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .returning();
      return row ? mapEvent(row) : null;
    },
    transition: async (ctx, eventId, from, status, now) => {
      const timeField =
        status === 'open'
          ? { openedAt: now, closedAt: null }
          : status === 'closed'
            ? { closedAt: now }
            : { archivedAt: now };
      const [row] = await db
        .update(events)
        .set({ status, ...timeField, updatedAt: now })
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
            eq(events.status, from),
          ),
        )
        .returning();
      return row ? mapEvent(row) : null;
    },
  };
}

function mapEventClass(row: typeof eventClasses.$inferSelect): EventClass {
  return {
    ...row,
    organizationId: organizationId(row.organizationId),
    vehicleType: row.vehicleType as EventClass['vehicleType'],
    passengerMode: row.passengerMode as EventClass['passengerMode'],
  };
}

export function createEventClassRepository(db: Database): EventClassRepository {
  return {
    listByEvent: async (ctx, eventId) =>
      (
        await db
          .select()
          .from(eventClasses)
          .where(
            and(
              eq(eventClasses.organizationId, ctx.organizationId),
              eq(eventClasses.eventId, eventId),
            ),
          )
          .orderBy(eventClasses.sortOrder, eventClasses.name)
      ).map(mapEventClass),
    create: async (ctx, eventId, input: EventClassInput) => {
      const [row] = await db
        .insert(eventClasses)
        .values({ ...input, organizationId: ctx.organizationId, eventId })
        .returning();
      return mapEventClass(row!);
    },
    update: async (ctx, eventId, classId, patch: Partial<EventClassInput>) => {
      const [row] = await db
        .update(eventClasses)
        .set({ ...patch, updatedAt: new Date() })
        .where(
          and(
            eq(eventClasses.organizationId, ctx.organizationId),
            eq(eventClasses.eventId, eventId),
            eq(eventClasses.id, classId),
          ),
        )
        .returning();
      return row ? mapEventClass(row) : null;
    },
  };
}

export function createEventSetupRepository(db: Database): EventSetupRepository {
  const mapEvent = (row: typeof events.$inferSelect): Event => ({
    id: row.id,
    organizationId: organizationId(row.organizationId),
    slug: row.slug,
    name: row.name,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    status: row.status as EventStatus,
    registrationOpensAt: row.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: row.registrationClosesAt?.toISOString() ?? null,
    openedAt: row.openedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  });
  return {
    createSetup: async (ctx, input: EventSetupInput) =>
      db.transaction(async (tx) => {
        const [row] = await tx
          .insert(events)
          .values({
            organizationId: ctx.organizationId,
            ...input.event,
            registrationOpensAt: input.event.registrationOpensAt
              ? new Date(input.event.registrationOpensAt)
              : null,
            registrationClosesAt: input.event.registrationClosesAt
              ? new Date(input.event.registrationClosesAt)
              : null,
            consentTerms: input.terms,
          })
          .returning();
        if (!row) throw new Error('Event setup insert failed');
        const eventClassesCreated = await tx
          .insert(eventClasses)
          .values(
            input.classes.map((item, sortOrder) => ({
              organizationId: ctx.organizationId,
              eventId: row.id,
              name: item.name,
              code: item.code,
              vehicleType: item.vehicleType,
              sortOrder,
              maxParticipants: item.maxParticipants ?? null,
              closed: item.closed ?? false,
              passengerMode: item.passengerMode ?? 'optional',
            })),
          )
          .returning();
        const priceRows = input.classes.flatMap((setupClass, index) => {
          const createdClass = eventClassesCreated[index];
          if (!createdClass)
            throw new Error('Event setup class pairing failed');
          return [
            {
              organizationId: ctx.organizationId,
              eventId: row.id,
              classId: createdClass.id,
              baseCents: setupClass.price.baseCents,
              additionalEntryAdjustmentCents:
                setupClass.price.additionalEntryAdjustmentCents,
              earlyBirdDeadline: setupClass.price.earlyBirdDeadline
                ? new Date(setupClass.price.earlyBirdDeadline)
                : null,
              earlyBirdDiscountCents: setupClass.price.earlyBirdDiscountCents,
            },
          ];
        });
        await tx.insert(eventClassPricingRules).values(priceRows);
        await tx.insert(eventConsentTermsAudit).values({
          organizationId: ctx.organizationId,
          eventId: row.id,
          actor: input.actor,
          beforeTerms: [],
          afterTerms: input.terms,
        });
        return mapEvent(row);
      }),
  };
}
