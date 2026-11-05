import type { Database } from './database.js';
import type { RequestContext } from '@racepilot/core';
import {
  people,
  vehicles,
  registrationGroups,
  entries,
} from './schema/entries.js';
import { organizations, events, eventClasses } from './schema/organization.js';
import { eq, and, inArray } from 'drizzle-orm';
import { registrationFormUploads } from './schema/forms.js';
import { sql } from 'drizzle-orm';
import {} from './schema/billing.js';
import { loadEntryAdminHistory } from './entry-admin-history.js';

export async function attachAdminEntryDetails(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  items: readonly import('@racepilot/core').Entry[],
): Promise<import('@racepilot/core').Entry[]> {
  if (!items.length) return [];
  const ids = items.map((item) => item.id);
  const groupIds = [...new Set(items.map((item) => item.registrationGroupId))];
  const groupRows = await db
    .select({
      id: registrationGroups.id,
      eventId: registrationGroups.eventId,
      customAnswers: registrationGroups.customAnswers,
      eventConfig: events.registrationFormConfig,
      organizationConfig: organizations.registrationFormConfig,
      locale: organizations.locale,
    })
    .from(registrationGroups)
    .innerJoin(
      events,
      and(
        eq(events.id, registrationGroups.eventId),
        eq(events.organizationId, ctx.organizationId),
      ),
    )
    .innerJoin(
      organizations,
      eq(organizations.id, registrationGroups.organizationId),
    )
    .where(
      and(
        eq(registrationGroups.organizationId, ctx.organizationId),
        inArray(registrationGroups.id, groupIds),
      ),
    );
  const groupById = new Map(groupRows.map((row) => [row.id, row]));
  const referencedUploads = groupRows.length
    ? await db
        .select({
          registrationGroupId: registrationFormUploads.registrationGroupId,
          eventId: registrationFormUploads.eventId,
          objectId: registrationFormUploads.objectId,
          fieldKey: registrationFormUploads.fieldKey,
        })
        .from(registrationFormUploads)
        .where(
          and(
            eq(registrationFormUploads.organizationId, ctx.organizationId),
            inArray(
              registrationFormUploads.registrationGroupId,
              groupRows.map((row) => row.id),
            ),
            inArray(registrationFormUploads.eventId, [
              ...new Set(groupRows.map((row) => row.eventId)),
            ]),
            sql`${registrationFormUploads.consumedAt} is not null`,
          ),
        )
    : [];
  const uploadKeys = new Set(
    referencedUploads.map(
      (upload) =>
        `${upload.registrationGroupId}:${upload.eventId}:${upload.fieldKey}:${upload.objectId}`,
    ),
  );
  const customAnswersFor = (item: import('@racepilot/core').Entry) => {
    const group = groupById.get(item.registrationGroupId);
    if (!group || group.eventId !== item.eventId) return [];
    const eventConfig = group.eventConfig as Record<string, unknown> | null;
    const organizationConfig = group.organizationConfig as Record<
      string,
      unknown
    > | null;
    const fieldSource =
      eventConfig?.customFields ?? organizationConfig?.customFields;
    const fields = Array.isArray(fieldSource) ? fieldSource : [];
    const fieldByKey = new Map(
      fields.flatMap((field) => {
        if (!field || typeof field !== 'object') return [];
        const candidate = field as {
          key?: unknown;
          label?: { de?: unknown; en?: unknown };
          type?: unknown;
        };
        if (typeof candidate.key !== 'string') return [];
        return [[candidate.key, candidate] as const];
      }),
    );
    const answers = group.customAnswers ?? {};
    const locale = group.locale.toLowerCase().startsWith('en') ? 'en' : 'de';
    return Object.entries(answers).map(([key, answer]) => {
      const field = fieldByKey.get(key);
      if (
        answer &&
        typeof answer === 'object' &&
        !Array.isArray(answer) &&
        typeof answer.objectId === 'string' &&
        uploadKeys.has(`${group.id}:${group.eventId}:${key}:${answer.objectId}`)
      ) {
        return {
          key,
          label:
            typeof field?.label?.[locale] === 'string'
              ? field.label[locale]
              : key,
          value: null,
          fileDownloadUrl: `/admin/events/${group.eventId}/registration-form-uploads/${answer.objectId}`,
        };
      }
      if (typeof answer === 'string' || typeof answer === 'boolean')
        return {
          key,
          label:
            typeof field?.label?.[locale] === 'string'
              ? field.label[locale]
              : key,
          value: answer,
          fileDownloadUrl: null,
        };
      return {
        key,
        label:
          typeof field?.label?.[locale] === 'string'
            ? field.label[locale]
            : key,
        value: null,
        fileDownloadUrl: null,
      };
    });
  };
  const peopleRows = await db
    .select({
      entryId: entries.id,
      firstName: people.firstName,
      lastName: people.lastName,
      dateOfBirth: people.dateOfBirth,
      country: people.country,
      email: people.email,
      emailVerified: entries.verificationStatus,
    })
    .from(entries)
    .innerJoin(
      people,
      and(
        eq(people.id, entries.driverPersonId),
        eq(people.organizationId, ctx.organizationId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        inArray(entries.id, ids),
      ),
    );
  const vehicleRows = await db
    .select({
      entryId: entries.id,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      imageUrl: vehicles.imageUrl,
      registration: vehicles.registration,
    })
    .from(entries)
    .innerJoin(
      vehicles,
      and(
        eq(vehicles.id, entries.vehicleId),
        eq(vehicles.organizationId, ctx.organizationId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        inArray(entries.id, ids),
      ),
    );
  const classRows = await db
    .select({
      entryId: entries.id,
      code: eventClasses.code,
      name: eventClasses.name,
    })
    .from(entries)
    .innerJoin(
      eventClasses,
      and(
        eq(eventClasses.id, entries.classId),
        eq(eventClasses.eventId, entries.eventId),
        eq(eventClasses.organizationId, ctx.organizationId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        inArray(entries.id, ids),
      ),
    );
  const historyByEntry = await loadEntryAdminHistory(db, ctx, ids);
  const drivers = new Map(peopleRows.map((row) => [row.entryId, row]));
  const vehiclesByEntry = new Map(vehicleRows.map((row) => [row.entryId, row]));
  const classesByEntry = new Map(classRows.map((row) => [row.entryId, row]));
  return items.map((item) => {
    const driver = drivers.get(item.id);
    const vehicle = vehiclesByEntry.get(item.id);
    const eventClass = classesByEntry.get(item.id);
    const adminHistory = (historyByEntry.get(item.id) ?? []).sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    );
    return {
      ...item,
      adminHistory,
      adminDetails: {
        driver: {
          name: [driver?.firstName, driver?.lastName].filter(Boolean).join(' '),
          dateOfBirth: driver?.dateOfBirth ?? null,
          country: driver?.country ?? null,
          email: driver?.email ?? null,
          emailVerified: driver?.emailVerified === 'verified',
        },
        vehicle: {
          make: vehicle?.make ?? '',
          model: vehicle?.model ?? '',
          year: vehicle?.year ?? null,
          imageUrl: vehicle?.imageUrl ?? null,
          registration: vehicle?.registration ?? null,
        },
        eventClass: {
          code: eventClass?.code ?? '',
          name: eventClass?.name ?? '',
        },
        startNumber: item.requestedStartNumber,
        customAnswers: customAnswersFor(item),
      },
    };
  });
}
