import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  normalizeEmail,
  type PassengerPublicRepository,
  type RequestContext,
} from '@racepilot/core';
import type { Database } from './database.js';
import { matchAcceptedTerms, type ConsentTerm } from './consent-terms.js';
import { entries, people } from './schema/entries.js';
import { eventClasses, events, organizations } from './schema/organization.js';
import {
  entryPassengerConsentEvidence,
  entryPassengerLinks,
  entryPassengers,
} from './schema/passengers.js';
import { hashPassengerToken } from './passenger-link.js';

/** Whole years between two ISO dates (UTC), as the registration's age check counts them. */
function ageOn(dateOfBirth: string, onDate: string): number {
  const born = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const on = new Date(`${onDate}T00:00:00.000Z`);
  let age = on.getUTCFullYear() - born.getUTCFullYear();
  if (
    on.getUTCMonth() < born.getUTCMonth() ||
    (on.getUTCMonth() === born.getUTCMonth() &&
      on.getUTCDate() < born.getUTCDate())
  )
    age--;
  return age;
}

/**
 * Access with a personal link. Every query starts at the link row of the caller's organization and
 * reaches only the one entry behind it, so no other entry's data is reachable by any token.
 */
export function createPassengerPublicRepository(
  db: Database,
): PassengerPublicRepository {
  const openLink = (
    tx: Pick<Database, 'select'>,
    ctx: RequestContext,
    token: string,
  ) =>
    tx
      .select({
        linkId: entryPassengerLinks.id,
        expiresAt: entryPassengerLinks.expiresAt,
        passenger: entryPassengers,
        eventName: events.name,
        eventStartsOn: events.startsOn,
        eventStatus: events.status,
        consentTerms: events.consentTerms,
        className: eventClasses.name,
        driverFirstName: people.firstName,
        driverLastName: people.lastName,
        guardianRequiredBelowAge: sql<number>`coalesce((${organizations.registrationSettings}->>'guardianRequiredBelowAge')::int, 18)`,
      })
      .from(entryPassengerLinks)
      .innerJoin(
        entryPassengers,
        and(
          eq(
            entryPassengers.organizationId,
            entryPassengerLinks.organizationId,
          ),
          eq(entryPassengers.id, entryPassengerLinks.passengerId),
        ),
      )
      .innerJoin(
        entries,
        and(
          eq(entries.organizationId, entryPassengers.organizationId),
          eq(entries.id, entryPassengers.entryId),
          sql`${entries.deletedAt} is null`,
        ),
      )
      .innerJoin(
        events,
        and(
          eq(events.organizationId, entries.organizationId),
          eq(events.id, entries.eventId),
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
        people,
        and(
          eq(people.organizationId, entries.organizationId),
          eq(people.id, entries.driverPersonId),
        ),
      )
      .innerJoin(organizations, eq(organizations.id, entries.organizationId))
      .where(
        and(
          eq(entryPassengerLinks.organizationId, ctx.organizationId),
          eq(entryPassengerLinks.tokenHash, hashPassengerToken(token)),
          isNull(entryPassengerLinks.usedAt),
          isNull(entryPassengerLinks.revokedAt),
          gt(entryPassengerLinks.expiresAt, new Date()),
          isNull(entryPassengers.completedAt),
        ),
      );
  return {
    resolve: async (ctx, token) => {
      const [row] = await openLink(db, ctx, token).limit(1);
      if (!row || row.eventStatus === 'archived') return null;
      const passenger = row.passenger;
      return {
        eventName: row.eventName,
        className: row.className,
        // Enough for the co-driver to recognise who named them, nothing more.
        driverName: `${row.driverFirstName} ${row.driverLastName.charAt(0)}.`,
        passenger: {
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          email: passenger.email,
          dateOfBirth: passenger.dateOfBirth,
          country: passenger.country,
          phone: passenger.phone,
          street: passenger.street,
          postalCode: passenger.postalCode,
          city: passenger.city,
          emergencyContactName: passenger.emergencyContactName,
          emergencyContactPhone: passenger.emergencyContactPhone,
        },
        terms: row.consentTerms.map((term) => ({
          key: term.key,
          version: term.version,
          language: term.language,
          text: term.text,
          hash: term.hash,
          required: term.required !== false,
        })),
        expiresAt: row.expiresAt.toISOString(),
      };
    },
    complete: async (ctx, token, language, details, consents) =>
      db.transaction(async (tx) => {
        const now = new Date();
        const [row] = await openLink(tx, ctx, token)
          .for('update', { of: [entryPassengerLinks, entryPassengers] })
          .limit(1);
        if (!row || row.eventStatus === 'archived') return 'unavailable';
        if (
          details.dateOfBirth > now.toISOString().slice(0, 10) ||
          details.dateOfBirth > row.eventStartsOn
        )
          return 'invalid';
        if (
          ageOn(details.dateOfBirth, row.eventStartsOn) <
          row.guardianRequiredBelowAge
        )
          return 'guardian_required';
        const matched = matchAcceptedTerms(
          row.consentTerms as ConsentTerm[],
          consents,
          language,
        );
        if ('error' in matched)
          return matched.error === 'terms-mismatch'
            ? 'terms_mismatch'
            : 'terms_required';
        await tx
          .update(entryPassengers)
          .set({
            firstName: details.firstName.trim(),
            lastName: details.lastName.trim(),
            ...(details.email
              ? {
                  email: details.email.trim(),
                  emailNormalized: normalizeEmail(details.email),
                }
              : {}),
            dateOfBirth: details.dateOfBirth,
            country: details.country ?? null,
            phone: details.phone ?? null,
            street: details.street ?? null,
            postalCode: details.postalCode ?? null,
            city: details.city ?? null,
            emergencyContactName: details.emergencyContactName ?? null,
            emergencyContactPhone: details.emergencyContactPhone ?? null,
            language,
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(entryPassengers.organizationId, ctx.organizationId),
              eq(entryPassengers.id, row.passenger.id),
            ),
          );
        if (matched.terms.length)
          await tx.insert(entryPassengerConsentEvidence).values(
            matched.terms.map((term) => ({
              organizationId: ctx.organizationId,
              eventId: row.passenger.eventId,
              passengerId: row.passenger.id,
              textKey: term.key,
              textVersion: term.version,
              language,
              textHash: term.hash,
              acceptedAt: now,
            })),
          );
        await tx
          .update(entryPassengerLinks)
          .set({ usedAt: now })
          .where(
            and(
              eq(entryPassengerLinks.organizationId, ctx.organizationId),
              eq(entryPassengerLinks.id, row.linkId),
            ),
          );
        return 'completed';
      }),
  };
}
