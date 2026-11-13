import { and, eq, sql } from 'drizzle-orm';
import {
  effectivePassengerMode,
  normalizeEmail,
  registrationFeatureEnabled,
  resolveCanonicalOrigin,
  type CanonicalOrigin,
  type PassengerAdminRepository,
  type PassengerMode,
  type RequestContext,
} from '@racepilot/core';
import type { Database, TransactionDatabase } from './database.js';
import { entries, people } from './schema/entries.js';
import { eventClasses, events, organizations } from './schema/organization.js';
import { entryPassengers } from './schema/passengers.js';
import { issuePassengerLink } from './passenger-link.js';

function requireWrite(ctx: RequestContext) {
  if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
}

/** The entry with what decides whether it takes a co-driver; null outside the caller's organization. */
export async function loadPassengerEntry(
  tx: Pick<TransactionDatabase, 'select'>,
  ctx: RequestContext,
  entryId: string,
) {
  const [row] = await tx
    .select({
      entryId: entries.id,
      eventId: entries.eventId,
      driverFirstName: people.firstName,
      driverLastName: people.lastName,
      className: eventClasses.name,
      classMode: eventClasses.passengerMode,
      eventName: events.name,
      eventConfig: events.registrationFormConfig,
      organizationConfig: organizations.registrationFormConfig,
      locale: organizations.locale,
    })
    .from(entries)
    .innerJoin(
      people,
      and(
        eq(people.organizationId, entries.organizationId),
        eq(people.id, entries.driverPersonId),
      ),
    )
    .innerJoin(
      eventClasses,
      and(
        eq(eventClasses.organizationId, entries.organizationId),
        eq(eventClasses.eventId, entries.eventId),
        eq(eventClasses.id, entries.classId),
      ),
    )
    .innerJoin(
      events,
      and(
        eq(events.organizationId, entries.organizationId),
        eq(events.id, entries.eventId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, entries.organizationId))
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.id, entryId),
        sql`${entries.deletedAt} is null`,
      ),
    )
    .for('update', { of: entries })
    .limit(1);
  if (!row) return null;
  const mode: PassengerMode = effectivePassengerMode(
    registrationFeatureEnabled(
      row.organizationConfig as never,
      row.eventConfig as never,
      'passenger',
    ),
    row.classMode as PassengerMode,
  );
  return { ...row, mode };
}

/** Co-driver maintenance by the office: tenant-scoped, `entry:write` only. */
export function createPassengerAdminRepository(
  db: Database,
  options: { canonicalOrigin: CanonicalOrigin },
): PassengerAdminRepository {
  const insertPassenger = (
    tx: TransactionDatabase,
    ctx: RequestContext,
    entry: { entryId: string; eventId: string; locale: string },
    input: {
      firstName: string;
      lastName: string;
      email?: string | null | undefined;
      dateOfBirth?: string | null | undefined;
    },
    actor: string,
  ) =>
    tx
      .insert(entryPassengers)
      .values({
        organizationId: ctx.organizationId,
        eventId: entry.eventId,
        entryId: entry.entryId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email?.trim() || null,
        emailNormalized: input.email ? normalizeEmail(input.email) : null,
        dateOfBirth: input.dateOfBirth ?? null,
        language: entry.locale.toLowerCase().startsWith('en') ? 'en' : 'de',
        source: 'admin',
        createdBy: actor,
      })
      .returning();
  return {
    add: async (ctx, entryId, input, actor) => {
      requireWrite(ctx);
      if (!actor.trim()) throw new Error('Actor is required');
      return db.transaction(async (tx) => {
        const entry = await loadPassengerEntry(tx, ctx, entryId);
        if (!entry) return { status: 'not_found' as const };
        if (entry.mode === 'none') return { status: 'unavailable' as const };
        const [existing] = await tx
          .select({ id: entryPassengers.id })
          .from(entryPassengers)
          .where(
            and(
              eq(entryPassengers.organizationId, ctx.organizationId),
              eq(entryPassengers.entryId, entryId),
            ),
          )
          .limit(1);
        if (existing) return { status: 'exists' as const };
        await insertPassenger(tx, ctx, entry, input, actor);
        return { status: 'created' as const };
      });
    },
    issueLink: async (ctx, entryId, input, actor) => {
      requireWrite(ctx);
      if (!actor.trim()) throw new Error('Actor is required');
      const origin = await resolveCanonicalOrigin(options.canonicalOrigin, ctx);
      if (!origin) return { status: 'unavailable' as const };
      return db.transaction(async (tx) => {
        const entry = await loadPassengerEntry(tx, ctx, entryId);
        if (!entry) return { status: 'not_found' as const };
        if (entry.mode === 'none') return { status: 'unavailable' as const };
        let [passenger] = await tx
          .select()
          .from(entryPassengers)
          .where(
            and(
              eq(entryPassengers.organizationId, ctx.organizationId),
              eq(entryPassengers.entryId, entryId),
            ),
          )
          .for('update')
          .limit(1);
        if (!passenger) {
          if (!input.firstName || !input.lastName)
            return { status: 'no_passenger' as const };
          [passenger] = await insertPassenger(
            tx,
            ctx,
            entry,
            {
              firstName: input.firstName,
              lastName: input.lastName,
              email: input.email,
            },
            actor,
          );
        } else if (passenger.completedAt) {
          return { status: 'completed' as const };
        } else if (!passenger.email && input.email) {
          [passenger] = await tx
            .update(entryPassengers)
            .set({
              email: input.email.trim(),
              emailNormalized: normalizeEmail(input.email),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(entryPassengers.organizationId, ctx.organizationId),
                eq(entryPassengers.id, passenger.id),
              ),
            )
            .returning();
        }
        const link = await issuePassengerLink(
          db,
          tx,
          {
            organizationId: ctx.organizationId,
            eventId: entry.eventId,
            passengerId: passenger!.id,
            entryId,
            firstName: passenger!.firstName,
            lastName: passenger!.lastName,
            email: passenger!.email,
            language: passenger!.language,
            driverName: `${entry.driverFirstName} ${entry.driverLastName}`,
            eventName: entry.eventName,
          },
          origin,
          actor,
        );
        return {
          status: 'created' as const,
          url: link.url,
          expiresAt: link.expiresAt.toISOString(),
          mailQueued: link.mailQueued,
        };
      });
    },
  };
}
