import { and, eq, inArray, sql } from 'drizzle-orm';
import type { RequestContext } from '@racepilot/core';
import type { Database } from './database.js';
import { entries, registrationGroups } from './schema/entries.js';

export type DriverContext = {
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  publicationPreference: 'name_visible' | 'initials' | 'hidden' | null;
  identityShared: boolean;
  registrationEntryCount: number;
};

/**
 * Registration-scoped contact data plus the scope facts the editor needs:
 * whether the person is used by entries of other registrations, and how many entries
 * of this registration the contact data applies to.
 */
export async function loadDriverContexts(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  entryIds: string[],
): Promise<Map<string, DriverContext>> {
  const rows = await db
    .select({
      entryId: entries.id,
      phone: registrationGroups.phone,
      street: registrationGroups.street,
      postalCode: registrationGroups.postalCode,
      city: registrationGroups.city,
      emergencyContactName: registrationGroups.emergencyContactName,
      emergencyContactPhone: registrationGroups.emergencyContactPhone,
      publicationPreference: registrationGroups.publicationPreference,
      identityShared: sql<boolean>`exists (select 1 from entry other where other.organization_id = ${entries.organizationId} and other.driver_person_id = ${entries.driverPersonId} and other.registration_group_id <> ${entries.registrationGroupId})`,
      registrationEntryCount: sql<number>`(select count(*) from entry mate where mate.organization_id = ${entries.organizationId} and mate.registration_group_id = ${entries.registrationGroupId} and mate.deleted_at is null)::int`,
    })
    .from(entries)
    .innerJoin(
      registrationGroups,
      and(
        eq(registrationGroups.organizationId, entries.organizationId),
        eq(registrationGroups.id, entries.registrationGroupId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        inArray(entries.id, entryIds),
      ),
    );
  return new Map(
    rows.map(({ entryId, ...context }) => [
      entryId,
      {
        ...context,
        publicationPreference:
          context.publicationPreference as DriverContext['publicationPreference'],
      },
    ]),
  );
}
