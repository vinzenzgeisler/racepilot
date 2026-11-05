import type { RequestContext } from '@racepilot/core';
import { normalizeEmail } from '@racepilot/core';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { people, entries } from './schema/entries.js';
import { eventClasses } from './schema/organization.js';
import type {
  RegistrationSubmissionEvent,
  RegistrationSubmissionSettings,
  RegistrationSubmissionTransaction,
} from './registration-submit-types.js';

function normalizedName(value: string) {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export async function resolveRegistrationParticipant(args: {
  tx: RegistrationSubmissionTransaction;
  ctx: RequestContext;
  event: RegistrationSubmissionEvent;
  payload: import('./registration-settings.js').PublicRegistrationPayload;
  settings: RegistrationSubmissionSettings;
}): Promise<{
  personId: string;
  needsGuardian: boolean;
  uniqueClassIds: string[];
}> {
  const { tx, ctx, event, payload, settings } = args;
  const unavailable = () => new Error('Registration unavailable');
  const emailNormalized = normalizeEmail(payload.person.email);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:email:${emailNormalized}`}, 0))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:person:${normalizedName(payload.person.firstName)}:${normalizedName(payload.person.lastName)}:${payload.person.dateOfBirth}`}, 0))`,
  );
  const dob = new Date(`${payload.person.dateOfBirth}T00:00:00.000Z`);
  const eventStart = new Date(`${event.startsOn}T00:00:00.000Z`);
  if (!Number.isFinite(dob.getTime()) || dob > eventStart) throw unavailable();
  let age = eventStart.getUTCFullYear() - dob.getUTCFullYear();
  if (
    eventStart.getUTCMonth() < dob.getUTCMonth() ||
    (eventStart.getUTCMonth() === dob.getUTCMonth() &&
      eventStart.getUTCDate() < dob.getUTCDate())
  )
    age--;
  if (settings.minimumAge !== null && age < settings.minimumAge)
    throw unavailable();
  const needsGuardian = age < settings.guardianRequiredBelowAge;
  if (
    needsGuardian &&
    (!payload.person.guardianName?.trim() || !payload.person.guardianEmail)
  )
    throw unavailable();
  const uniqueClassIds = [
    ...new Set(payload.entries.map((entry) => entry.classId)),
  ];
  if (uniqueClassIds.length > settings.maximumClassesPerGroup)
    throw unavailable();
  const classes = await tx
    .select()
    .from(eventClasses)
    .where(
      and(
        eq(eventClasses.organizationId, ctx.organizationId),
        eq(eventClasses.eventId, event.id),
        inArray(eventClasses.id, uniqueClassIds),
      ),
    )
    .orderBy(eventClasses.id)
    .for('update');
  if (
    classes.length !== uniqueClassIds.length ||
    classes.some((eventClass) => eventClass.closed)
  )
    throw unavailable();
  for (const eventClass of classes) {
    const count = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(entries)
      .where(
        and(
          eq(entries.organizationId, ctx.organizationId),
          eq(entries.eventId, event.id),
          eq(entries.classId, eventClass.id),
          sql`${entries.deletedAt} is null`,
          sql`${entries.acceptanceStatus} <> 'withdrawn'`,
        ),
      );
    if (
      eventClass.maxParticipants !== null &&
      Number(count[0]?.count ?? 0) +
        payload.entries.filter((entry) => entry.classId === eventClass.id)
          .length >
        eventClass.maxParticipants
    )
      throw unavailable();
  }
  const emailOwners = await tx
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      dateOfBirth: people.dateOfBirth,
    })
    .from(people)
    .where(
      and(
        eq(people.organizationId, ctx.organizationId),
        eq(people.emailNormalized, emailNormalized),
        sql`${people.deletedAt} is null`,
      ),
    );
  const samePerson = emailOwners.find(
    (person) =>
      normalizedName(person.firstName) ===
        normalizedName(payload.person.firstName) &&
      normalizedName(person.lastName) ===
        normalizedName(payload.person.lastName) &&
      person.dateOfBirth === payload.person.dateOfBirth,
  );
  if (
    settings.sharedContactEmail === 'disallowed' &&
    emailOwners.some((person) => person.id !== samePerson?.id)
  )
    throw unavailable();
  let personId = samePerson?.id;
  if (!personId) {
    const sameBirthDate = await tx
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
      })
      .from(people)
      .where(
        and(
          eq(people.organizationId, ctx.organizationId),
          eq(people.dateOfBirth, payload.person.dateOfBirth),
          sql`${people.deletedAt} is null`,
        ),
      );
    if (
      sameBirthDate.some(
        (person) =>
          normalizedName(person.firstName) ===
            normalizedName(payload.person.firstName) &&
          normalizedName(person.lastName) ===
            normalizedName(payload.person.lastName),
      )
    )
      throw unavailable();
    const [person] = await tx
      .insert(people)
      .values({
        organizationId: ctx.organizationId,
        firstName: payload.person.firstName.trim(),
        lastName: payload.person.lastName.trim(),
        email: payload.person.email.trim(),
        emailNormalized,
        dateOfBirth: payload.person.dateOfBirth,
        country: payload.person.country ?? null,
      })
      .returning({ id: people.id });
    personId = person!.id;
  }
  return { personId, needsGuardian, uniqueClassIds };
}
