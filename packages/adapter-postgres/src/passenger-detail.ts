import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type {
  AdminEntryPassenger,
  AdminEntrySpareVehicle,
  RequestContext,
} from '@racepilot/core';
import type { Database } from './database.js';
import { toAdminConsent } from './entry-admin-consents.js';
import { entries, vehicles } from './schema/entries.js';
import { events } from './schema/organization.js';
import {
  entryPassengerConsentEvidence,
  entryPassengerLinks,
  entryPassengers,
} from './schema/passengers.js';

/** Co-driver and spare vehicle of the given entries, read within the caller's organization only. */
export async function loadPassengerDetails(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  entryIds: string[],
): Promise<{
  passengers: Map<string, AdminEntryPassenger>;
  spareVehicles: Map<string, AdminEntrySpareVehicle>;
}> {
  const passengers = new Map<string, AdminEntryPassenger>();
  const spareVehicles = new Map<string, AdminEntrySpareVehicle>();
  if (!entryIds.length) return { passengers, spareVehicles };
  const passengerRows = await db
    .select()
    .from(entryPassengers)
    .where(
      and(
        eq(entryPassengers.organizationId, ctx.organizationId),
        inArray(entryPassengers.entryId, entryIds),
      ),
    );
  const passengerIds = passengerRows.map((row) => row.id);
  const [openLinks, consentRows, spareRows] = await Promise.all([
    passengerIds.length
      ? db
          .select({
            passengerId: entryPassengerLinks.passengerId,
            expiresAt: entryPassengerLinks.expiresAt,
          })
          .from(entryPassengerLinks)
          .where(
            and(
              eq(entryPassengerLinks.organizationId, ctx.organizationId),
              inArray(entryPassengerLinks.passengerId, passengerIds),
              isNull(entryPassengerLinks.usedAt),
              isNull(entryPassengerLinks.revokedAt),
              gt(entryPassengerLinks.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(entryPassengerLinks.expiresAt))
      : [],
    passengerIds.length
      ? db
          .select({
            passengerId: entryPassengerConsentEvidence.passengerId,
            key: entryPassengerConsentEvidence.textKey,
            version: entryPassengerConsentEvidence.textVersion,
            language: entryPassengerConsentEvidence.language,
            textHash: entryPassengerConsentEvidence.textHash,
            acceptedAt: entryPassengerConsentEvidence.acceptedAt,
            terms: events.consentTerms,
          })
          .from(entryPassengerConsentEvidence)
          .innerJoin(
            events,
            and(
              eq(events.id, entryPassengerConsentEvidence.eventId),
              eq(
                events.organizationId,
                entryPassengerConsentEvidence.organizationId,
              ),
            ),
          )
          .where(
            and(
              eq(
                entryPassengerConsentEvidence.organizationId,
                ctx.organizationId,
              ),
              inArray(entryPassengerConsentEvidence.passengerId, passengerIds),
            ),
          )
      : [],
    db
      .select({
        entryId: entries.id,
        make: vehicles.make,
        model: vehicles.model,
        year: vehicles.year,
        registration: vehicles.registration,
      })
      .from(entries)
      .innerJoin(
        vehicles,
        and(
          eq(vehicles.organizationId, entries.organizationId),
          eq(vehicles.id, entries.spareVehicleId),
        ),
      )
      .where(
        and(
          eq(entries.organizationId, ctx.organizationId),
          inArray(entries.id, entryIds),
        ),
      ),
  ]);
  const linkExpiry = new Map<string, Date>();
  for (const link of openLinks)
    if (!linkExpiry.has(link.passengerId))
      linkExpiry.set(link.passengerId, link.expiresAt);
  for (const row of passengerRows) {
    const expiresAt = linkExpiry.get(row.id);
    passengers.set(row.entryId, {
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      dateOfBirth: row.dateOfBirth,
      country: row.country,
      phone: row.phone,
      street: row.street,
      postalCode: row.postalCode,
      city: row.city,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      source: row.source,
      status: row.completedAt
        ? 'completed'
        : expiresAt
          ? 'invited'
          : 'recorded',
      completedAt: row.completedAt?.toISOString() ?? null,
      linkExpiresAt: row.completedAt
        ? null
        : (expiresAt?.toISOString() ?? null),
      consents: consentRows
        .filter((consent) => consent.passengerId === row.id)
        .sort((a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime())
        .map(toAdminConsent),
    });
  }
  for (const row of spareRows)
    spareVehicles.set(row.entryId, {
      make: row.make,
      model: row.model,
      year: row.year,
      registration: row.registration,
    });
  return { passengers, spareVehicles };
}
