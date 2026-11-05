import { emailOutbox, emailTemplateVersions } from './mail-schema.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import type { PublicRegistrationPayload } from './registration-settings.js';
import { createInvoiceRepository } from './billing-invoices.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { organizations, events, eventClasses } from './schema/organization.js';
import {
  people,
  vehicles,
  registrationGroups,
  entries,
  entryAuditEvents,
} from './schema/entries.js';
import {
  eventEntryStatusDimensionConfigs,
  entryStatusDimensionValues,
  entryStatusDimensionAudit,
} from './schema/status.js';
import {
  eventClassPricingRules,
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
} from './schema/billing.js';
import {
  publicEntrySubmissions,
  groupEmailVerifications,
} from './schema/public-registration.js';
import {
  registrationFormDrafts,
  registrationFormUploads,
  consentEvidence,
  eventConsentTermsAudit,
} from './schema/forms.js';

export { createEntryConfirmationRepository } from './entry-confirmation.js';
export { ensureCommunityOrganization } from './organization.js';
export { emailTemplateVersions } from './mail-schema.js';
export { emailOutbox } from './mail-schema.js';
export { emailDeliveries } from './mail-schema.js';
export { createOrganizationRepository } from './organization.js';
export { createEventRepository } from './events.js';
export { createEventClassRepository } from './events.js';
export { createMembershipRepository } from './memberships.js';
export { createPersonRepository } from './people.js';
export { createVehicleRepository } from './people.js';
export { createEntryExportRepository } from './entry-repositories.js';
export { createInvoicePaymentRepository } from './billing-payments.js';
export { createPaymentRecipientRepository } from './billing-payments.js';
export { createEventClassPricingRepository } from './billing-invoices.js';
export { createInvoiceRepository } from './billing-invoices.js';
export type { MailOutboxExecutor } from './mail-outbox.js';
export type { NewMailOutboxMessage } from './mail-outbox.js';
export { enqueueMailOutbox } from './mail-outbox.js';
export { setOrganizationMailConfiguration } from './mail-templates.js';
export { getOrganizationMailConfiguration } from './mail-templates.js';
export { saveMailTemplateVersion } from './mail-templates.js';
export { createMailOutboxRepository } from './mail-outbox.js';
export type { RegistrationSettings } from './registration-settings.js';
export { createRegistrationSettingsRepository } from './registration-settings.js';
export { createRegistrationFormConfigRepository } from './registration-settings.js';
export type { PublicRegistrationPayload } from './registration-settings.js';
export { createEntryWorkflowRepository } from './entry-workflow.js';
export { createEntryStatusDimensionRepository } from './entry-status-dimensions.js';
export type { TimingMeasurementInput } from './timing-types.js';
export type { TimingMeasurementRecord } from './timing-types.js';
export type { TimingRepository } from './timing-types.js';
export type { TimingResultVersion } from './timing-types.js';
export { createTimingRepository } from './timing-repository.js';
export * from './schema/organization.js';
export * from './schema/entries.js';
export * from './schema/status.js';
export * from './schema/billing.js';
export * from './schema/public-registration.js';
export * from './schema/forms.js';
export * from './schema/modules.js';

import { createHash, randomBytes } from 'node:crypto';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, and, inArray, desc, asc, ilike, or, count } from 'drizzle-orm';

import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@racepilot/core';
import {
  organizationId,
  calculatePrice,
  assertEntryTransition,
  normalizeEmail,
  normalizeRequestedStartNumber,
  defaultEntryWorkflow,
  projectEntryStatuses,
  defaultEntryStatusDimensionConfig,
  ProviderError,
} from '@racepilot/core';
import type { Pool } from 'pg';

export { createModuleActivationRepository } from './module-activation.js';

export { artifactJobs, createArtifactJobRepository } from './artifact-jobs.js';

import { uuidPattern } from './database.js';
import type { Database } from './database.js';
export type { Database } from './database.js';
export { createPostgresRegistrationRateLimiter } from './registration-rate-limits.js';
export { createPublicRegistrationRateLimitSettingsRepository } from './registration-rate-limit-settings.js';

export async function migrate(databaseUrl: string): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await drizzleMigrate(drizzle(pool), {
      migrationsFolder: new URL('../migrations', import.meta.url).pathname,
    });
  } finally {
    await pool.end();
  }
}
export async function withOrganizationTransaction<T>(
  db: Database,
  ctx: RequestContext,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.organization_id', ${ctx.organizationId}, true)`,
    );
    return fn(tx as unknown as Database);
  });
}

export async function createDatabase(databaseUrl: string) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool), pool: pool as Pool };
}

function mapEntry(
  row: typeof entries.$inferSelect,
): import('@racepilot/core').Entry {
  return {
    id: row.id,
    eventId: row.eventId,
    classId: row.classId,
    registrationGroupId: row.registrationGroupId,
    driverPersonId: row.driverPersonId,
    vehicleId: row.vehicleId,
    requestedStartNumber: row.requestedStartNumber,
    priceSnapshotVersion: row.priceSnapshotVersion,
    formSnapshotVersion: row.formSnapshotVersion,
    priceSnapshot: row.priceSnapshot,
    deletionReason: row.deletionReason,
    organizationId: organizationId(row.organizationId),
    verificationStatus:
      row.verificationStatus as import('@racepilot/core').Entry['verificationStatus'],
    acceptanceStatus:
      row.acceptanceStatus as import('@racepilot/core').Entry['acceptanceStatus'],
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
async function projectEntryRows(
  db: Pick<Database, 'select' | 'execute'>,
  ctx: RequestContext,
  rows: readonly (typeof entries.$inferSelect)[],
): Promise<import('@racepilot/core').Entry[]> {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((row) => row.id))];
  const revisionIds = [
    ...new Set(
      rows
        .map((row) => row.workflowRevisionId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const eventIds = [...new Set(rows.map((row) => row.eventId))];
  const groupIds = [...new Set(rows.map((row) => row.registrationGroupId))];
  const inSql = (values: readonly string[]) =>
    sql`(${sql.join(
      values.map((value) => sql`${value}`),
      sql`, `,
    )})`;
  const [
    workflowResult,
    configs,
    states,
    invoiceRows,
    eventRows,
    starterResult,
  ] = await Promise.all([
    revisionIds.length
      ? db.execute(sql`
            SELECT id, workflow FROM entry_workflow_revision
            WHERE organization_id=${ctx.organizationId} AND id IN ${inSql(revisionIds)}
          `)
      : Promise.resolve({ rows: [] }),
    db
      .select({
        eventId: eventEntryStatusDimensionConfigs.eventId,
        config: eventEntryStatusDimensionConfigs.config,
      })
      .from(eventEntryStatusDimensionConfigs)
      .where(
        and(
          eq(
            eventEntryStatusDimensionConfigs.organizationId,
            ctx.organizationId,
          ),
          inArray(eventEntryStatusDimensionConfigs.eventId, eventIds),
        ),
      ),
    db
      .select({
        entryId: entryStatusDimensionValues.entryId,
        dimension: entryStatusDimensionValues.dimension,
        value: entryStatusDimensionValues.value,
      })
      .from(entryStatusDimensionValues)
      .where(
        and(
          eq(entryStatusDimensionValues.organizationId, ctx.organizationId),
          inArray(entryStatusDimensionValues.entryId, ids),
        ),
      ),
    db
      .select({
        registrationGroupId: invoices.registrationGroupId,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, ctx.organizationId),
          inArray(invoices.registrationGroupId, groupIds),
        ),
      ),
    db
      .select({
        id: events.id,
        registrationClosesAt: events.registrationClosesAt,
      })
      .from(events)
      .where(
        and(
          eq(events.organizationId, ctx.organizationId),
          inArray(events.id, eventIds),
        ),
      ),
    db.execute(sql`
        SELECT id, count(*) OVER (PARTITION BY event_id, driver_person_id) > 1 AS double_starter
        FROM entry WHERE organization_id=${ctx.organizationId}
          AND event_id IN ${inSql(eventIds)} AND deleted_at IS NULL
      `),
  ]);
  type WorkflowRow = {
    id: string;
    workflow: import('@racepilot/core').EntryWorkflow;
  };
  type StarterRow = { id: string; double_starter: boolean };
  const workflowMap = new Map(
    (workflowResult as unknown as { rows: WorkflowRow[] }).rows.map((row) => [
      row.id,
      row.workflow,
    ]),
  );
  const starterMap = new Map(
    (starterResult as unknown as { rows: StarterRow[] }).rows.map((row) => [
      row.id,
      row.double_starter,
    ]),
  );
  const configMap = new Map(configs.map((row) => [row.eventId, row.config]));
  const stateMap = new Map(
    states.map((row) => [`${row.entryId}:${row.dimension}`, row.value]),
  );
  const invoiceMap = new Map(
    invoiceRows.map((row) => [row.registrationGroupId, row.status]),
  );
  const closeMap = new Map(
    eventRows.map((row) => [row.id, row.registrationClosesAt]),
  );
  return rows.map((row) => {
    const rawHints = row.statusHints ?? {
      double_starter: false,
      passenger: false,
      late_entry: false,
    };
    const closesAt = closeMap.get(row.eventId);
    const hints = {
      double_starter:
        rawHints.double_starter || starterMap.get(row.id) === true,
      passenger: rawHints.passenger,
      late_entry:
        rawHints.late_entry || Boolean(closesAt && row.createdAt > closesAt),
    };
    const invoiceStatus = invoiceMap.get(row.registrationGroupId);
    const paymentStatus =
      invoiceStatus === undefined
        ? 'not_required'
        : invoiceStatus === 'cancelled'
          ? 'not_relevant'
          : invoiceStatus;
    const statusProjection = projectEntryStatuses({
      workflow:
        workflowMap.get(row.workflowRevisionId ?? '') ?? defaultEntryWorkflow,
      acceptanceStatus: row.acceptanceStatus,
      paymentStatus,
      technicalStatus:
        stateMap.get(`${row.id}:technical_inspection`) ?? 'not_relevant',
      waiverStatus: stateMap.get(`${row.id}:waiver`) ?? 'not_relevant',
      emailStatus: row.verificationStatus,
      config: configMap.get(row.eventId) ?? defaultEntryStatusDimensionConfig,
      hints,
    });
    return { ...mapEntry(row), statusProjection };
  });
}
async function attachAdminEntryDetails(
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
  const [entryAudits, dimensionAudits, paymentAudits, mailRows] =
    await Promise.all([
      db
        .select()
        .from(entryAuditEvents)
        .where(
          and(
            eq(entryAuditEvents.organizationId, ctx.organizationId),
            inArray(entryAuditEvents.entryId, ids),
          ),
        ),
      db
        .select()
        .from(entryStatusDimensionAudit)
        .where(
          and(
            eq(entryStatusDimensionAudit.organizationId, ctx.organizationId),
            inArray(entryStatusDimensionAudit.entryId, ids),
          ),
        ),
      db
        .select({
          entryId: entries.id,
          id: invoicePaymentAuditEvents.id,
          action: invoicePaymentAuditEvents.action,
          actor: invoicePaymentAuditEvents.actor,
          reason: invoicePaymentAuditEvents.reason,
          occurredAt: invoicePaymentAuditEvents.occurredAt,
        })
        .from(invoicePaymentAuditEvents)
        .innerJoin(
          invoicePayments,
          and(
            eq(invoicePayments.id, invoicePaymentAuditEvents.paymentId),
            eq(invoicePayments.organizationId, ctx.organizationId),
          ),
        )
        .innerJoin(
          invoices,
          and(
            eq(invoices.id, invoicePayments.invoiceId),
            eq(invoices.organizationId, ctx.organizationId),
          ),
        )
        .innerJoin(
          registrationGroups,
          and(
            eq(registrationGroups.id, invoices.registrationGroupId),
            eq(registrationGroups.organizationId, ctx.organizationId),
          ),
        )
        .innerJoin(
          entries,
          and(
            eq(entries.registrationGroupId, registrationGroups.id),
            eq(entries.organizationId, ctx.organizationId),
          ),
        )
        .where(
          and(
            eq(invoicePaymentAuditEvents.organizationId, ctx.organizationId),
            inArray(entries.id, ids),
          ),
        ),
      db
        .select({
          entryId: entries.id,
          id: emailOutbox.id,
          status: emailOutbox.status,
          templateKey: emailOutbox.templateKey,
          recipient: emailOutbox.recipient,
          createdAt: emailOutbox.createdAt,
          sentAt: emailOutbox.sentAt,
        })
        .from(emailOutbox)
        .innerJoin(
          registrationGroups,
          and(
            eq(registrationGroups.organizationId, emailOutbox.organizationId),
            eq(registrationGroups.id, emailOutbox.registrationGroupId),
            eq(registrationGroups.eventId, emailOutbox.eventId),
          ),
        )
        .innerJoin(
          entries,
          and(
            eq(entries.organizationId, registrationGroups.organizationId),
            eq(entries.registrationGroupId, registrationGroups.id),
            eq(entries.eventId, emailOutbox.eventId),
          ),
        )
        .where(
          and(
            eq(emailOutbox.organizationId, ctx.organizationId),
            inArray(entries.id, ids),
          ),
        ),
    ]);
  const historyByEntry = new Map<
    string,
    Array<{
      id: string;
      kind: 'entry' | 'status' | 'payment' | 'email';
      label: string;
      actor: string;
      occurredAt: string;
      detail: string;
    }>
  >();
  const appendHistory = (
    entryId: string,
    item: {
      id: string;
      kind: 'entry' | 'status' | 'payment' | 'email';
      label: string;
      actor: string;
      occurredAt: Date | string;
      detail: string;
    },
  ) => {
    const list = historyByEntry.get(entryId) ?? [];
    list.push({ ...item, occurredAt: new Date(item.occurredAt).toISOString() });
    historyByEntry.set(entryId, list);
  };
  for (const row of entryAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'entry',
      label: `${row.transition}: ${row.fromStatus} → ${row.toStatus}`,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: row.reason,
    });
  for (const row of dimensionAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'status',
      label: `${row.dimension}: ${row.fromValue} → ${row.toValue}`,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: row.reason,
    });
  for (const row of paymentAudits)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'payment',
      label: row.action,
      actor: row.actor,
      occurredAt: row.occurredAt,
      detail: row.reason,
    });
  for (const row of mailRows)
    appendHistory(row.entryId, {
      id: row.id,
      kind: 'email',
      label: `${row.templateKey}: ${row.status}`,
      actor: 'System',
      occurredAt: row.sentAt ?? row.createdAt,
      detail: row.recipient,
    });
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

/** Drizzle's database and transaction objects both satisfy this executor. */

/** Call with the caller's Drizzle transaction to atomically enqueue with domain writes. */

export function createPublicRegistrationService(
  db: Database,
  options: { canonicalBaseUrl: string; tokenTtlMs?: number },
) {
  const canonicalBase = new URL(options.canonicalBaseUrl);
  if (!['https:', 'http:'].includes(canonicalBase.protocol))
    throw new Error('Invalid canonical URL');
  const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');
  return {
    registerCustomFieldUpload: async (
      ctx: RequestContext,
      eventSlug: string,
      fieldKey: string,
      objectId: string,
      uploadTokenHash: string,
    ) => {
      if (
        !uuidPattern.test(objectId) ||
        !/^[a-f0-9]{64}$/.test(uploadTokenHash)
      )
        return false;
      const [event] = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.slug, eventSlug),
            eq(events.status, 'open'),
          ),
        )
        .limit(1);
      if (
        !event ||
        (event.registrationOpensAt && event.registrationOpensAt > new Date()) ||
        (event.registrationClosesAt && event.registrationClosesAt < new Date())
      )
        return false;
      const [org] = await db
        .select({ config: organizations.registrationFormConfig })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId))
        .limit(1);
      const orgConfig = org?.config as
        Record<string, unknown> | null | undefined;
      const eventConfig = event.registrationFormConfig as Record<
        string,
        unknown
      > | null;
      const fields = (eventConfig?.customFields ??
        orgConfig?.customFields ??
        []) as Array<{ key?: string; type?: string }>;
      if (
        !fields.some((field) => field.key === fieldKey && field.type === 'file')
      )
        return false;
      await db.insert(registrationFormUploads).values({
        organizationId: ctx.organizationId,
        eventId: event.id,
        fieldKey,
        objectId,
        uploadTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      return true;
    },
    canDownloadCustomFieldUpload: async (
      ctx: RequestContext,
      eventId: string,
      objectId: string,
    ) => {
      const [upload] = await db
        .select({ id: registrationFormUploads.id })
        .from(registrationFormUploads)
        .where(
          and(
            eq(registrationFormUploads.organizationId, ctx.organizationId),
            eq(registrationFormUploads.eventId, eventId),
            eq(registrationFormUploads.objectId, objectId),
            sql`${registrationFormUploads.registrationGroupId} is not null`,
          ),
        )
        .limit(1);
      return Boolean(upload);
    },
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
    saveDraft: async (
      ctx: RequestContext,
      eventSlug: string,
      email: string,
      language: 'de' | 'en',
      draftData: Record<string, unknown>,
    ) => {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      const normalized = normalizeEmail(email);
      const now = new Date();
      const ttl = 7 * 24 * 60 * 60_000;
      return db.transaction(async (tx) => {
        const [event] = await tx
          .select()
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.slug, eventSlug),
              eq(events.status, 'open'),
            ),
          )
          .limit(1)
          .for('share');
        if (
          !event ||
          (event.registrationClosesAt && event.registrationClosesAt <= now)
        )
          throw new Error('Registration unavailable');
        // Draft JSON is long-lived and must never retain an upload bearer token.
        // Validate each file reference against the tenant/event/field-scoped
        // upload row, then persist only its opaque object id. resumeDraft
        // rotates the hash and returns a fresh token to the participant.
        const safeDraftData = structuredClone(draftData);
        const draftAnswers = safeDraftData.customAnswers;
        if (
          draftAnswers &&
          typeof draftAnswers === 'object' &&
          !Array.isArray(draftAnswers)
        ) {
          const [organization] = await tx
            .select({ config: organizations.registrationFormConfig })
            .from(organizations)
            .where(eq(organizations.id, ctx.organizationId))
            .limit(1);
          const organizationConfig = organization?.config as
            Record<string, unknown> | null | undefined;
          const eventConfig = event.registrationFormConfig as Record<
            string,
            unknown
          > | null;
          const configuredFields = (eventConfig?.customFields ??
            organizationConfig?.customFields ??
            []) as Array<{
            key: string;
            type: 'text' | 'select' | 'yes_no' | 'file';
            options?: Array<{ value: string }>;
          }>;
          const fieldsByKey = new Map(
            configuredFields.map((field) => [field.key, field]),
          );
          for (const [fieldKey, answer] of Object.entries(
            draftAnswers as Record<string, unknown>,
          )) {
            const field = fieldsByKey.get(fieldKey);
            if (!field) throw new Error('Registration unavailable');
            if (
              answer &&
              typeof answer === 'object' &&
              !Array.isArray(answer)
            ) {
              if (field.type !== 'file')
                throw new Error('Registration unavailable');
              const fileAnswer = answer as {
                objectId?: unknown;
                uploadToken?: unknown;
              };
              if (
                typeof fileAnswer.objectId !== 'string' ||
                typeof fileAnswer.uploadToken !== 'string'
              )
                throw new Error('Registration unavailable');
              const [upload] = await tx
                .select({ id: registrationFormUploads.id })
                .from(registrationFormUploads)
                .where(
                  and(
                    eq(
                      registrationFormUploads.organizationId,
                      ctx.organizationId,
                    ),
                    eq(registrationFormUploads.eventId, event.id),
                    eq(registrationFormUploads.fieldKey, fieldKey),
                    eq(registrationFormUploads.objectId, fileAnswer.objectId),
                    eq(
                      registrationFormUploads.uploadTokenHash,
                      hashToken(fileAnswer.uploadToken),
                    ),
                    sql`${registrationFormUploads.registrationGroupId} is null`,
                    sql`${registrationFormUploads.consumedAt} is null`,
                    sql`${registrationFormUploads.expiresAt} > ${now}`,
                  ),
                )
                .for('update')
                .limit(1);
              if (!upload) throw new Error('Registration unavailable');
              (draftAnswers as Record<string, unknown>)[fieldKey] = {
                objectId: fileAnswer.objectId,
              };
            } else if (
              answer !== undefined &&
              answer !== '' &&
              !(
                (field.type === 'text' && typeof answer === 'string') ||
                (field.type === 'select' &&
                  typeof answer === 'string' &&
                  field.options?.some((option) => option.value === answer)) ||
                (field.type === 'yes_no' && typeof answer === 'boolean')
              )
            ) {
              throw new Error('Registration unavailable');
            }
          }
        }
        await tx
          .insert(registrationFormDrafts)
          .values({
            organizationId: ctx.organizationId,
            eventId: event.id,
            emailNormalized: normalized,
            recipientEmail: email.trim(),
            language,
            draftData: safeDraftData,
            resumeTokenHash: tokenHash,
            expiresAt: new Date(now.getTime() + ttl),
            consumedAt: null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              registrationFormDrafts.organizationId,
              registrationFormDrafts.eventId,
              registrationFormDrafts.emailNormalized,
            ],
            set: {
              recipientEmail: email.trim(),
              language,
              draftData: safeDraftData,
              resumeTokenHash: tokenHash,
              expiresAt: new Date(now.getTime() + ttl),
              consumedAt: null,
              updatedAt: now,
            },
          });
        const resumeUrl = new URL(
          `/registration/resume#token=${encodeURIComponent(token)}`,
          canonicalBase,
        ).toString();
        await enqueueMailOutbox(
          db,
          ctx.organizationId,
          {
            eventId: event.id,
            templateKey: 'registration-resume',
            templateVersion: 1,
            templateVersionId: null,
            locale: language,
            recipient: email.trim(),
            idempotencyKey: `registration-resume:${event.id}:${tokenHash}`,
            variables: {
              recipientName:
                typeof safeDraftData.firstName === 'string'
                  ? safeDraftData.firstName.slice(0, 100)
                  : '',
              resumeUrl,
            },
            correlationId: randomUUID(),
          },
          tx,
        );
        return { sent: true as const };
      });
    },
    resumeDraft: async (ctx: RequestContext, token: string) =>
      db.transaction(async (tx) => {
        const now = new Date();
        const digest = hashToken(token);
        const [draft] = await tx
          .select()
          .from(registrationFormDrafts)
          .where(
            and(
              eq(registrationFormDrafts.organizationId, ctx.organizationId),
              eq(registrationFormDrafts.resumeTokenHash, digest),
              sql`${registrationFormDrafts.expiresAt} > ${now}`,
              sql`${registrationFormDrafts.consumedAt} is null`,
            ),
          )
          .for('update')
          .limit(1);
        if (!draft) return null;
        const [consumed] = await tx
          .update(registrationFormDrafts)
          .set({ consumedAt: now })
          .where(
            and(
              eq(registrationFormDrafts.id, draft.id),
              eq(registrationFormDrafts.resumeTokenHash, digest),
              sql`${registrationFormDrafts.consumedAt} is null`,
              sql`${registrationFormDrafts.expiresAt} > ${now}`,
            ),
          )
          .returning({ id: registrationFormDrafts.id });
        if (!consumed) return null;
        const resumedDraft = structuredClone(draft.draftData);
        const answers = resumedDraft.customAnswers;
        if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
          for (const [fieldKey, answer] of Object.entries(
            answers as Record<string, unknown>,
          )) {
            if (
              answer &&
              typeof answer === 'object' &&
              !Array.isArray(answer)
            ) {
              const objectId = (answer as { objectId?: unknown }).objectId;
              if (typeof objectId !== 'string')
                throw new Error('Registration unavailable');
              const token = randomBytes(32).toString('base64url');
              const [rotated] = await tx
                .update(registrationFormUploads)
                .set({ uploadTokenHash: hashToken(token) })
                .where(
                  and(
                    eq(
                      registrationFormUploads.organizationId,
                      ctx.organizationId,
                    ),
                    eq(registrationFormUploads.eventId, draft.eventId),
                    eq(registrationFormUploads.fieldKey, fieldKey),
                    eq(registrationFormUploads.objectId, objectId),
                    sql`${registrationFormUploads.registrationGroupId} is null`,
                    sql`${registrationFormUploads.consumedAt} is null`,
                    sql`${registrationFormUploads.expiresAt} > ${now}`,
                  ),
                )
                .returning({ id: registrationFormUploads.id });
              if (!rotated) throw new Error('Registration unavailable');
              (answers as Record<string, unknown>)[fieldKey] = {
                objectId,
                uploadToken: token,
              };
            }
          }
        }
        return {
          eventSlug:
            (
              await tx
                .select({ slug: events.slug })
                .from(events)
                .where(
                  and(
                    eq(events.organizationId, ctx.organizationId),
                    eq(events.id, draft.eventId),
                  ),
                )
                .limit(1)
            )[0]?.slug ?? null,
          language: draft.language,
          draft: resumedDraft,
        };
      }),
    getForm: async (ctx: RequestContext, eventSlug: string) => {
      const [event] = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.slug, eventSlug),
            eq(events.status, 'open'),
          ),
        )
        .limit(1);
      if (
        !event ||
        (event.registrationOpensAt && event.registrationOpensAt > new Date()) ||
        (event.registrationClosesAt && event.registrationClosesAt < new Date())
      )
        return null;
      const classRows = await db
        .select()
        .from(eventClasses)
        .where(
          and(
            eq(eventClasses.organizationId, ctx.organizationId),
            eq(eventClasses.eventId, event.id),
            eq(eventClasses.closed, false),
          ),
        )
        .orderBy(eventClasses.sortOrder);
      const pricingRows = await db
        .select()
        .from(eventClassPricingRules)
        .where(
          and(
            eq(eventClassPricingRules.organizationId, ctx.organizationId),
            eq(eventClassPricingRules.eventId, event.id),
          ),
        );
      const [organization] = await db
        .select({
          registrationSettings: organizations.registrationSettings,
          registrationFormConfig: organizations.registrationFormConfig,
          currency: organizations.currency,
        })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId))
        .limit(1);
      const organizationConfig = organization?.registrationFormConfig as
        Record<string, unknown> | null | undefined;
      const eventConfig = event.registrationFormConfig as Record<
        string,
        unknown
      > | null;
      const mergeSection = (key: string) => ({
        ...((organizationConfig?.[key] as
          Record<string, unknown> | undefined) ?? {}),
        ...((eventConfig?.[key] as Record<string, unknown> | undefined) ?? {}),
      });
      const registrationFormConfig =
        organizationConfig && eventConfig
          ? {
              ...organizationConfig,
              ...eventConfig,
              branding: mergeSection('branding'),
              fields: mergeSection('fields'),
              features: mergeSection('features'),
            }
          : (eventConfig ?? organizationConfig ?? null);
      return {
        event: {
          id: event.id,
          slug: event.slug,
          name: event.name,
          startsOn: event.startsOn,
          registrationClosesAt:
            event.registrationClosesAt?.toISOString() ?? null,
        },
        classes: classRows,
        currency: organization?.currency ?? 'EUR',
        pricing: pricingRows.map((rule) => ({
          classId: rule.classId,
          baseCents: rule.baseCents,
          additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
          earlyBirdDeadline: rule.earlyBirdDeadline?.toISOString() ?? null,
          earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
        })),
        consents: event.consentTerms,
        registrationSettings: organization?.registrationSettings ?? {
          sharedContactEmail: 'allowed',
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        },
        registrationFormConfig,
      };
    },
    submit: async (
      ctx: RequestContext,
      eventSlug: string,
      payload: PublicRegistrationPayload,
    ) => {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      const canonicalize = (value: unknown): string => {
        if (Array.isArray(value))
          return `[${value.map(canonicalize).join(',')}]`;
        if (value && typeof value === 'object') {
          const record = value as Record<string, unknown>;
          return `{${Object.keys(record)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
            .join(',')}}`;
        }
        return JSON.stringify(value) ?? 'null';
      };
      const requestFingerprint = createHash('sha256')
        .update(canonicalize(payload))
        .digest('hex');
      const receivedAt = new Date();
      return db.transaction(async (tx) => {
        const [event] = await tx
          .select()
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.slug, eventSlug),
            ),
          )
          .for('share')
          .limit(1);
        const unavailable = () => new Error('Registration unavailable');
        const submissionConflict = () =>
          new ProviderError('conflict', 'Submission ID conflict');
        if (!event) throw unavailable();
        const [existingSubmission] = await tx
          .select()
          .from(publicEntrySubmissions)
          .where(
            and(
              eq(publicEntrySubmissions.organizationId, ctx.organizationId),
              eq(publicEntrySubmissions.eventId, event.id),
              eq(publicEntrySubmissions.submissionId, payload.submissionId),
            ),
          )
          .limit(1);
        if (existingSubmission) {
          if (existingSubmission.requestFingerprint !== requestFingerprint)
            throw submissionConflict();
          if (existingSubmission.response) return existingSubmission.response;
        }
        if (
          event.status !== 'open' ||
          (event.registrationOpensAt &&
            event.registrationOpensAt > receivedAt) ||
          (event.registrationClosesAt &&
            event.registrationClosesAt < receivedAt)
        )
          throw unavailable();
        const formConfig = (event.registrationFormConfig ?? {}) as Record<
          string,
          unknown
        >;
        const formFeatures = (formConfig.features ?? {}) as Record<
          string,
          unknown
        >;
        const orgFormConfig = (
          await tx
            .select({ config: organizations.registrationFormConfig })
            .from(organizations)
            .where(eq(organizations.id, ctx.organizationId))
            .limit(1)
        )[0]?.config as Record<string, unknown> | null | undefined;
        const orgFormFeatures = (orgFormConfig?.features ?? {}) as Record<
          string,
          unknown
        >;
        const customFields = (formConfig.customFields ??
          orgFormConfig?.customFields ??
          []) as Array<{
          key: string;
          type: 'text' | 'select' | 'yes_no' | 'file';
          required: boolean;
          options?: Array<{ value: string }>;
        }>;
        const customAnswers = payload.customAnswers ?? {};
        const customFieldByKey = new Map(
          customFields.map((field) => [field.key, field]),
        );
        if (
          Object.keys(customAnswers).some((key) => !customFieldByKey.has(key))
        )
          throw unavailable();
        const safeCustomAnswers: Record<
          string,
          string | boolean | { objectId: string }
        > = {};
        const customFileUploads: Array<{
          fieldKey: string;
          objectId: string;
          tokenHash: string;
        }> = [];
        if (
          payload.entries.length > 1 &&
          (formFeatures.multipleEntries ?? orgFormFeatures.multipleEntries) ===
            false
        )
          throw unavailable();
        const eventNumberState = (
          (formConfig.fields ?? {}) as Record<string, Record<string, unknown>>
        ).requestedStartNumber?.state;
        const orgNumberState = (
          (orgFormConfig?.fields ?? {}) as Record<
            string,
            Record<string, unknown>
          >
        ).requestedStartNumber?.state;
        if (
          (eventNumberState ?? orgNumberState) === 'hidden' &&
          payload.entries.some((entry) => entry.requestedStartNumber)
        )
          throw unavailable();
        if (!existingSubmission) {
          const [reservation] = await tx
            .insert(publicEntrySubmissions)
            .values({
              organizationId: ctx.organizationId,
              eventId: event.id,
              submissionId: payload.submissionId,
              requestFingerprint,
            })
            .onConflictDoUpdate({
              target: [
                publicEntrySubmissions.organizationId,
                publicEntrySubmissions.eventId,
                publicEntrySubmissions.submissionId,
              ],
              set: {
                requestFingerprint: sql`${publicEntrySubmissions.requestFingerprint}`,
              },
            })
            .returning({
              requestFingerprint: publicEntrySubmissions.requestFingerprint,
              response: publicEntrySubmissions.response,
              inserted: sql<boolean>`xmax = 0`,
            });
          if (!reservation) throw unavailable();
          if (!reservation.inserted) {
            if (reservation.requestFingerprint !== requestFingerprint)
              throw submissionConflict();
            if (reservation.response) return reservation.response;
            throw unavailable();
          }
        }
        for (const field of customFields) {
          const rawAnswer = customAnswers[field.key];
          const answer =
            field.type === 'text' && typeof rawAnswer === 'string'
              ? rawAnswer.trim()
              : rawAnswer;
          if (answer === undefined || answer === '') {
            if (field.required) throw unavailable();
            continue;
          }
          if (field.type === 'text' && typeof answer === 'string') {
            safeCustomAnswers[field.key] = answer;
          } else if (
            field.type === 'select' &&
            typeof answer === 'string' &&
            field.options?.some((option) => option.value === answer)
          ) {
            safeCustomAnswers[field.key] = answer;
          } else if (field.type === 'yes_no' && typeof answer === 'boolean') {
            safeCustomAnswers[field.key] = answer;
          } else if (field.type === 'file' && typeof answer === 'object') {
            const tokenHash = hashToken(answer.uploadToken);
            const [upload] = await tx
              .select({
                id: registrationFormUploads.id,
                objectId: registrationFormUploads.objectId,
              })
              .from(registrationFormUploads)
              .where(
                and(
                  eq(
                    registrationFormUploads.organizationId,
                    ctx.organizationId,
                  ),
                  eq(registrationFormUploads.eventId, event.id),
                  eq(registrationFormUploads.fieldKey, field.key),
                  eq(registrationFormUploads.objectId, answer.objectId),
                  eq(registrationFormUploads.uploadTokenHash, tokenHash),
                  sql`${registrationFormUploads.consumedAt} is null`,
                  sql`${registrationFormUploads.expiresAt} > ${receivedAt}`,
                ),
              )
              .for('update')
              .limit(1);
            if (!upload) throw unavailable();
            safeCustomAnswers[field.key] = { objectId: upload.objectId };
            customFileUploads.push({
              fieldKey: field.key,
              objectId: upload.objectId,
              tokenHash,
            });
          } else {
            throw unavailable();
          }
        }
        const [org] = await tx
          .select({
            settings: organizations.registrationSettings,
            currency: organizations.currency,
          })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .limit(1);
        if (!org) throw unavailable();
        const settings = org.settings ?? {
          sharedContactEmail: 'allowed' as const,
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        };
        const emailNormalized = normalizeEmail(payload.person.email);
        const normalizedName = (value: string) =>
          value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:email:${emailNormalized}`}, 0))`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:person:${normalizedName(payload.person.firstName)}:${normalizedName(payload.person.lastName)}:${payload.person.dateOfBirth}`}, 0))`,
        );
        const dob = new Date(`${payload.person.dateOfBirth}T00:00:00.000Z`);
        const eventStart = new Date(`${event.startsOn}T00:00:00.000Z`);
        if (!Number.isFinite(dob.getTime()) || dob > eventStart)
          throw unavailable();
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
          (!payload.person.guardianName?.trim() ||
            !payload.person.guardianEmail)
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
        const consentTerms = event.consentTerms ?? [];
        const selectedTerms = payload.consents.map((consent) => {
          const term = consentTerms.find(
            (item) =>
              item.key === consent.key &&
              item.version === consent.version &&
              item.language === payload.language &&
              item.hash === consent.hash,
          );
          if (!term) throw unavailable();
          const actualHash = createHash('sha256')
            .update(term.text)
            .digest('hex');
          if (actualHash !== consent.hash) throw unavailable();
          return term;
        });
        if (
          consentTerms.some(
            (term) =>
              term.language === payload.language &&
              term.required !== false &&
              !selectedTerms.some(
                (selected) =>
                  selected.key === term.key &&
                  selected.version === term.version &&
                  selected.hash === term.hash,
              ),
          )
        )
          throw unavailable();
        const [priorGroup] = await tx
          .select({ id: registrationGroups.id })
          .from(registrationGroups)
          .where(
            and(
              eq(registrationGroups.organizationId, ctx.organizationId),
              eq(registrationGroups.eventId, event.id),
              eq(registrationGroups.personId, personId),
            ),
          )
          .limit(1);
        if (priorGroup) throw unavailable();
        const [group] = await tx
          .insert(registrationGroups)
          .values({
            organizationId: ctx.organizationId,
            eventId: event.id,
            personId,
            contactEmail: payload.person.email.trim(),
            guardianName: needsGuardian
              ? payload.person.guardianName!.trim()
              : null,
            guardianEmail: needsGuardian
              ? payload.person.guardianEmail!.trim()
              : null,
            customAnswers: safeCustomAnswers,
          })
          .returning({ id: registrationGroups.id });
        for (const upload of customFileUploads) {
          const [consumed] = await tx
            .update(registrationFormUploads)
            .set({ registrationGroupId: group!.id, consumedAt: receivedAt })
            .where(
              and(
                eq(registrationFormUploads.organizationId, ctx.organizationId),
                eq(registrationFormUploads.eventId, event.id),
                eq(registrationFormUploads.fieldKey, upload.fieldKey),
                eq(registrationFormUploads.objectId, upload.objectId),
                eq(registrationFormUploads.uploadTokenHash, upload.tokenHash),
                sql`${registrationFormUploads.consumedAt} is null`,
              ),
            )
            .returning({ id: registrationFormUploads.id });
          if (!consumed) throw unavailable();
        }
        const [template] = await tx
          .select()
          .from(emailTemplateVersions)
          .where(
            and(
              eq(emailTemplateVersions.organizationId, ctx.organizationId),
              eq(emailTemplateVersions.templateKey, 'verification'),
              eq(emailTemplateVersions.locale, payload.language),
            ),
          )
          .orderBy(desc(emailTemplateVersions.version))
          .limit(1);
        const classRules = await tx
          .select()
          .from(eventClassPricingRules)
          .where(
            and(
              eq(eventClassPricingRules.organizationId, ctx.organizationId),
              eq(eventClassPricingRules.eventId, event.id),
            ),
          )
          .for('share');
        const selectedRules = classRules.filter((rule) =>
          uniqueClassIds.includes(rule.classId),
        );
        if (
          classRules.length > 0 &&
          selectedRules.length !== uniqueClassIds.length
        )
          throw unavailable();
        const snapshot =
          classRules.length > 0
            ? calculatePrice({
                currency: org.currency,
                submittedAt: receivedAt.toISOString(),
                lines: selectedRules.map((rule) => ({
                  classId: rule.classId,
                  quantity: payload.entries.filter(
                    (entry) => entry.classId === rule.classId,
                  ).length,
                  rule: {
                    classId: rule.classId,
                    baseCents: rule.baseCents,
                    additionalEntryAdjustmentCents:
                      rule.additionalEntryAdjustmentCents,
                    earlyBirdDeadline:
                      rule.earlyBirdDeadline?.toISOString() ?? null,
                    earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
                  },
                })),
              })
            : null;
        const entryRepo = createEntryRepository(db);
        const invoiceRepo = createInvoiceRepository(db);
        const entryIds: string[] = [];
        for (const requestEntry of payload.entries) {
          const [vehicle] = await tx
            .insert(vehicles)
            .values({
              organizationId: ctx.organizationId,
              make: requestEntry.vehicle.make.trim(),
              model: requestEntry.vehicle.model.trim(),
              year: requestEntry.vehicle.year,
              registration: requestEntry.vehicle.registration?.trim() ?? null,
            })
            .returning({ id: vehicles.id });
          const entry = await entryRepo.create!(
            ctx,
            {
              eventId: event.id,
              classId: requestEntry.classId,
              registrationGroupId: group!.id,
              driverPersonId: personId,
              vehicleId: vehicle!.id,
              requestedStartNumber: normalizeRequestedStartNumber(
                requestEntry.requestedStartNumber,
              ),
              priceSnapshotVersion: snapshot?.version ?? null,
              priceSnapshot: snapshot,
              formSnapshotVersion: payload.formVersion,
            },
            tx,
          );
          entryIds.push(entry.id);
        }
        if (snapshot)
          await invoiceRepo.issue(ctx, event.id, group!.id, snapshot, tx);
        for (const term of selectedTerms)
          await tx.insert(consentEvidence).values({
            organizationId: ctx.organizationId,
            eventId: event.id,
            registrationGroupId: group!.id,
            textKey: term.key,
            textVersion: term.version,
            language: payload.language,
            textHash: term.hash,
            acceptedAt: receivedAt,
          });
        await tx.insert(groupEmailVerifications).values({
          organizationId: ctx.organizationId,
          eventId: event.id,
          registrationGroupId: group!.id,
          tokenHash,
          expiresAt: new Date(
            receivedAt.getTime() + (options.tokenTtlMs ?? 24 * 60 * 60_000),
          ),
        });
        const verificationUrl = new URL(
          `/registration/verify?token=${encodeURIComponent(token)}`,
          canonicalBase,
        ).toString();
        await enqueueMailOutbox(
          db,
          ctx.organizationId,
          {
            eventId: event.id,
            registrationGroupId: group!.id,
            templateKey: 'verification',
            templateVersion: template?.version ?? 1,
            templateVersionId: template?.id ?? null,
            locale: payload.language,
            recipient: payload.person.email,
            idempotencyKey: `registration-verification:${payload.submissionId}`,
            variables: {
              verificationUrl,
              recipientName: `${payload.person.firstName.trim()} ${payload.person.lastName.trim()}`,
            },
            correlationId: payload.submissionId,
          },
          tx,
        );
        const response = {
          accepted: true as const,
          entryCount: entryIds.length,
        };
        await tx
          .update(publicEntrySubmissions)
          .set({ registrationGroupId: group!.id, response })
          .where(
            and(
              eq(publicEntrySubmissions.organizationId, ctx.organizationId),
              eq(publicEntrySubmissions.eventId, event.id),
              eq(publicEntrySubmissions.submissionId, payload.submissionId),
            ),
          );
        return response;
      });
    },
    verify: async (ctx: RequestContext, token: string) =>
      db.transaction(async (tx) => {
        const now = new Date();
        const digest = hashToken(token);
        const [verification] = await tx
          .select()
          .from(groupEmailVerifications)
          .where(
            and(
              eq(groupEmailVerifications.organizationId, ctx.organizationId),
              eq(groupEmailVerifications.tokenHash, digest),
              sql`${groupEmailVerifications.consumedAt} is null`,
              sql`${groupEmailVerifications.expiresAt} > ${now}`,
            ),
          )
          .for('update')
          .limit(1);
        if (!verification) return false;
        const consumed = await tx
          .update(groupEmailVerifications)
          .set({ consumedAt: now })
          .where(
            and(
              eq(groupEmailVerifications.organizationId, ctx.organizationId),
              eq(groupEmailVerifications.id, verification.id),
              sql`${groupEmailVerifications.consumedAt} is null`,
              sql`${groupEmailVerifications.expiresAt} > ${now}`,
            ),
          )
          .returning({ id: groupEmailVerifications.id });
        if (!consumed.length) return false;
        const groupEntries = await tx
          .select({
            id: entries.id,
            verificationStatus: entries.verificationStatus,
          })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.eventId, verification.eventId),
              eq(entries.registrationGroupId, verification.registrationGroupId),
              sql`${entries.deletedAt} is null`,
            ),
          );
        for (const entry of groupEntries) {
          if (entry.verificationStatus === 'verified') continue;
          assertEntryTransition(
            'verification',
            entry.verificationStatus,
            'verified',
          );
          const updated = await tx
            .update(entries)
            .set({ verificationStatus: 'verified' })
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.id, entry.id),
                eq(entries.verificationStatus, entry.verificationStatus),
              ),
            )
            .returning({
              id: entries.id,
              workflowRevisionId: entries.workflowRevisionId,
            });
          if (updated.length)
            await tx.insert(entryAuditEvents).values({
              organizationId: ctx.organizationId,
              entryId: entry.id,
              transition: 'verification',
              fromStatus: entry.verificationStatus,
              toStatus: 'verified',
              actor: 'email-verification',
              reason: 'Registration group email verified',
              workflowRevisionId: updated[0]!.workflowRevisionId!,
            });
        }
        return groupEntries.length > 0;
      }),
  };
}

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

/** Tenant-scoped immutable workflow revisions with organization defaults and event overrides. */

/** Event-scoped status dimensions and audited per-entry status markers. */

export function createEntryRepository(
  db: Database,
): import('@racepilot/core').EntryRepository {
  return {
    create: async (ctx, input, executor) => {
      const executorDb = (executor as Database | undefined) ?? db;
      const [row] = await executorDb
        .insert(entries)
        .values({
          organizationId: ctx.organizationId,
          eventId: input.eventId,
          classId: input.classId,
          registrationGroupId: input.registrationGroupId,
          driverPersonId: input.driverPersonId,
          vehicleId: input.vehicleId,
          acceptanceStatus: 'pending',
          requestedStartNumber: normalizeRequestedStartNumber(
            input.requestedStartNumber,
          ),
          priceSnapshotVersion: input.priceSnapshotVersion,
          formSnapshotVersion: input.formSnapshotVersion,
          priceSnapshot: input.priceSnapshot ?? null,
        })
        .returning();
      return mapEntry(row!);
    },
    getById: async (ctx, id) => {
      const [row] = await db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.id, id),
            sql`${entries.deletedAt} is null`,
          ),
        );
      return row
        ? (
            await attachAdminEntryDetails(
              db,
              ctx,
              await projectEntryRows(db, ctx, [row]),
            )
          )[0]!
        : null;
    },
    listAdmin: async (ctx, query) => {
      const predicates = [
        eq(entries.organizationId, ctx.organizationId),
        sql`${entries.deletedAt} is null`,
      ];
      if (query.eventId) predicates.push(eq(entries.eventId, query.eventId));
      if (query.classId) predicates.push(eq(entries.classId, query.classId));
      if (query.acceptanceStatus)
        predicates.push(eq(entries.acceptanceStatus, query.acceptanceStatus));
      if (query.verificationStatus)
        predicates.push(
          eq(entries.verificationStatus, query.verificationStatus),
        );
      if (query.paymentStatus === 'not_required')
        predicates.push(
          sql`not exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId})`,
        );
      else if (query.paymentStatus === 'not_relevant')
        predicates.push(
          sql`exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status = 'cancelled')`,
        );
      else if (query.paymentStatus)
        predicates.push(
          sql`exists (select 1 from invoice i where i.organization_id = ${entries.organizationId} and i.registration_group_id = ${entries.registrationGroupId} and i.status = ${query.paymentStatus})`,
        );
      const search = query.search?.trim();
      if (search) {
        const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
        predicates.push(
          or(
            ilike(entries.requestedStartNumber, pattern),
            sql`${entries.id}::text ilike ${pattern}`,
            ilike(people.firstName, pattern),
            ilike(people.lastName, pattern),
            ilike(vehicles.make, pattern),
            ilike(vehicles.model, pattern),
            ilike(vehicles.registration, pattern),
            ilike(eventClasses.name, pattern),
          )!,
        );
      }
      const where = and(...predicates);
      const sortColumns = {
        createdAt: entries.createdAt,
        requestedStartNumber: entries.requestedStartNumber,
        acceptanceStatus: entries.acceptanceStatus,
        verificationStatus: entries.verificationStatus,
      } as const;
      const sortColumn = sortColumns[query.sort];
      const [rows, totals] = await Promise.all([
        db
          .select({ entry: entries })
          .from(entries)
          .innerJoin(
            people,
            and(
              eq(people.id, entries.driverPersonId),
              eq(people.organizationId, entries.organizationId),
            ),
          )
          .innerJoin(
            vehicles,
            and(
              eq(vehicles.id, entries.vehicleId),
              eq(vehicles.organizationId, entries.organizationId),
            ),
          )
          .innerJoin(
            eventClasses,
            and(
              eq(eventClasses.id, entries.classId),
              eq(eventClasses.eventId, entries.eventId),
              eq(eventClasses.organizationId, entries.organizationId),
            ),
          )
          .where(where)
          .orderBy(
            query.direction === 'asc' ? asc(sortColumn) : desc(sortColumn),
            asc(entries.id),
          )
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db
          .select({ total: count() })
          .from(entries)
          .innerJoin(
            people,
            and(
              eq(people.id, entries.driverPersonId),
              eq(people.organizationId, entries.organizationId),
            ),
          )
          .innerJoin(
            vehicles,
            and(
              eq(vehicles.id, entries.vehicleId),
              eq(vehicles.organizationId, entries.organizationId),
            ),
          )
          .innerJoin(
            eventClasses,
            and(
              eq(eventClasses.id, entries.classId),
              eq(eventClasses.eventId, entries.eventId),
              eq(eventClasses.organizationId, entries.organizationId),
            ),
          )
          .where(where),
      ]);
      return {
        items: await attachAdminEntryDetails(
          db,
          ctx,
          await projectEntryRows(
            db,
            ctx,
            rows.map((row) => row.entry),
          ),
        ),
        total: totals[0]?.total ?? 0,
      };
    },
    transition: async (
      ctx,
      id,
      transition,
      fromStatus,
      toStatus,
      actor,
      reason,
      workflow,
    ) =>
      db.transaction(async (tx) => {
        const statusColumn =
          transition === 'verification'
            ? entries.verificationStatus
            : entries.acceptanceStatus;
        const [row] = await tx
          .update(entries)
          .set({
            [transition === 'verification'
              ? 'verificationStatus'
              : 'acceptanceStatus']: toStatus,
          })
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, id),
              eq(statusColumn, fromStatus),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .returning();
        if (!row) return null;
        await tx.insert(entryAuditEvents).values({
          organizationId: ctx.organizationId,
          entryId: id,
          transition,
          fromStatus,
          toStatus,
          actor,
          reason,
          workflowRevisionId:
            workflow?.workflowRevisionId ?? row.workflowRevisionId!,
          ...(workflow ? { statusCategory: workflow.statusCategory } : {}),
        });
        if (transition === 'acceptance' && workflow?.notification) {
          const [recipient] = await tx
            .select({
              email: sql<
                string | null
              >`coalesce(${registrationGroups.contactEmail}, ${people.email})`,
              recipientName: sql<string>`concat_ws(' ', ${people.firstName}, ${people.lastName})`,
              eventName: events.name,
              locale: organizations.locale,
            })
            .from(entries)
            .innerJoin(
              events,
              and(
                eq(events.id, entries.eventId),
                eq(events.organizationId, entries.organizationId),
              ),
            )
            .innerJoin(
              organizations,
              eq(organizations.id, entries.organizationId),
            )
            .innerJoin(
              people,
              and(
                eq(people.id, entries.driverPersonId),
                eq(people.organizationId, entries.organizationId),
              ),
            )
            .innerJoin(
              registrationGroups,
              and(
                eq(registrationGroups.id, entries.registrationGroupId),
                eq(registrationGroups.organizationId, entries.organizationId),
              ),
            )
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.id, id),
              ),
            )
            .limit(1);
          if (recipient?.email) {
            await enqueueMailOutbox(
              db,
              ctx.organizationId,
              {
                eventId: row.eventId,
                registrationGroupId: row.registrationGroupId,
                templateKey: 'status-change',
                templateVersion: 1,
                locale: recipient.locale === 'en' ? 'en' : 'de',
                recipient: recipient.email,
                idempotencyKey: `entry-status:${id}:${workflow.workflowRevisionId}:${fromStatus}:${toStatus}`,
                correlationId: ctx.correlationId,
                variables: {
                  recipientName: recipient.recipientName,
                  eventName: recipient.eventName,
                  statusKey: workflow.notification.statusKey,
                  statusLabelDe: workflow.notification.statusLabelDe,
                  statusLabelEn: workflow.notification.statusLabelEn,
                },
              },
              tx,
            );
          }
        }
        // Return the same read model as entry detail, including the audit just written.
        const projected = await projectEntryRows(tx, ctx, [row]);
        return (await attachAdminEntryDetails(tx, ctx, projected))[0] ?? null;
      }),
    softDelete: async (ctx, id, reason) => {
      const [row] = await db
        .update(entries)
        .set({ deletedAt: new Date(), deletionReason: reason })
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.id, id),
            sql`${entries.deletedAt} is null`,
          ),
        )
        .returning();
      return row ? mapEntry(row) : null;
    },
  };
}
