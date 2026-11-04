import { drizzle } from 'drizzle-orm/node-postgres';
import {
  organizations,
  events,
  eventClasses,
  userIdentities,
  organizationMemberships,
} from './schema/organization.js';
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
  eventEntryStatusDimensionConfigAudit,
  entryStatusHintsAudit,
} from './schema/status.js';
import {
  eventClassPricingRules,
  organizationPaymentRecipients,
  invoiceReferenceCounters,
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
  registrationSettingsAudit,
  registrationFormConfigAudit,
} from './schema/forms.js';

export * from './schema/organization.js';
export * from './schema/entries.js';
export * from './schema/status.js';
export * from './schema/billing.js';
export * from './schema/public-registration.js';
export * from './schema/forms.js';
export * from './schema/modules.js';

import { createHash, randomBytes } from 'node:crypto';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import {
  eq,
  and,
  inArray,
  asc,
  desc,
  ilike,
  or,
  count,
  lt,
  lte,
} from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  check,
  index,
  integer,
  foreignKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  RequestContext,
  OrganizationRepository,
  OrganizationPatch,
  Organization,
  EventRepository,
  EventClassRepository,
  Event,
  EventClass,
  EventStatus,
  EventInput,
  EventPatch,
  EventClassInput,
  MembershipRepository,
  InvoicePaymentRepository,
  PaymentRecipientRepository,
  PaymentRecipient,
  EventClassPricingRepository,
  InvoiceRepository,
  InvoiceRecord,
  MembershipBootstrap,
  ExternalIdentity,
  EntryConfirmationRepository,
  EntryStatusHintKey,
} from '@racepilot/core';
import {
  organizationId,
  permissionsForRole,
  calculatePrice,
  assertEntryTransition,
  normalizeEmail,
  normalizeRequestedStartNumber,
  deriveInvoiceStatus,
  createPaymentReference,
  defaultEntryWorkflow,
  normalizeEntryWorkflow,
  projectEntryStatuses,
  defaultEntryStatusDimensionConfig,
  validateEntryStatusDimensionConfig,
  EntryStatusInUseError,
  ProviderError,
} from '@racepilot/core';
import type { Pool } from 'pg';

export { createModuleActivationRepository } from './module-activation.js';

export function createEntryConfirmationRepository(
  db: Database,
): EntryConfirmationRepository {
  return {
    getByGroup: async (ctx, eventId, groupId) => {
      const rows = await db
        .select({
          eventName: events.name,
          eventStartsOn: events.startsOn,
          groupId: registrationGroups.id,
          driverFirst: people.firstName,
          driverLast: people.lastName,
          vehicleMake: vehicles.make,
          vehicleModel: vehicles.model,
          className: eventClasses.name,
          snapshot: entries.priceSnapshot,
          paymentReference: invoices.paymentReference,
        })
        .from(registrationGroups)
        .innerJoin(
          events,
          and(
            eq(events.organizationId, registrationGroups.organizationId),
            eq(events.id, registrationGroups.eventId),
          ),
        )
        .innerJoin(
          entries,
          and(
            eq(entries.organizationId, registrationGroups.organizationId),
            eq(entries.eventId, registrationGroups.eventId),
            eq(entries.registrationGroupId, registrationGroups.id),
            sql`${entries.deletedAt} is null`,
          ),
        )
        .innerJoin(
          people,
          and(
            eq(people.organizationId, entries.organizationId),
            eq(people.id, entries.driverPersonId),
            sql`${people.deletedAt} is null`,
          ),
        )
        .innerJoin(
          vehicles,
          and(
            eq(vehicles.organizationId, entries.organizationId),
            eq(vehicles.id, entries.vehicleId),
            sql`${vehicles.deletedAt} is null`,
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
        .leftJoin(
          invoices,
          and(
            eq(invoices.organizationId, registrationGroups.organizationId),
            eq(invoices.eventId, registrationGroups.eventId),
            eq(invoices.registrationGroupId, registrationGroups.id),
          ),
        )
        .where(
          and(
            eq(registrationGroups.organizationId, ctx.organizationId),
            eq(registrationGroups.eventId, eventId),
            eq(registrationGroups.id, groupId),
          ),
        );
      if (!rows.length || !rows[0]!.snapshot) return null;
      const snapshot = rows[0]!.snapshot;
      if (
        rows.some(
          (row) =>
            !row.snapshot ||
            row.snapshot.version !== snapshot.version ||
            row.snapshot.calculatedAt !== snapshot.calculatedAt ||
            row.snapshot.currency !== snapshot.currency ||
            row.snapshot.totalCents !== snapshot.totalCents,
        )
      )
        throw new Error('Registration group price snapshot mismatch');
      const reference = rows[0]!.paymentReference ?? '';
      return {
        eventId,
        eventName: rows[0]!.eventName,
        eventStartsOn: String(rows[0]!.eventStartsOn),
        registrationGroupId: rows[0]!.groupId,
        driverName: `${rows[0]!.driverFirst} ${rows[0]!.driverLast}`,
        vehicles: [
          ...new Set(
            rows.map((row) => `${row.vehicleMake} ${row.vehicleModel}`),
          ),
        ],
        classes: [...new Set(rows.map((row) => row.className))],
        priceSnapshot: snapshot,
        paymentReference: reference,
      };
    },
  };
}
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
export async function ensureCommunityOrganization(
  db: Database,
  config: { slug: string; name: string; timezone: string; locale: string },
): Promise<Organization> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('racepilot.community.bootstrap'))`,
    );
    const rows = await tx.select().from(organizations);
    if (rows.length > 1)
      throw new Error('Community deployment requires exactly one organization');
    if (rows.length === 1) {
      if (rows[0]!.slug !== config.slug)
        throw new Error(
          'Community organization slug does not match configuration',
        );
      return mapOrg(rows[0]!);
    }
    const [row] = await tx
      .insert(organizations)
      .values({ ...config })
      .returning();
    return mapOrg(row!);
  });
}
function mapOrg(r: typeof organizations.$inferSelect): Organization {
  return {
    id: organizationId(r.id),
    slug: r.slug,
    name: r.name,
    status: r.status as 'active' | 'disabled',
    contactEmail: r.contactEmail,
    websiteUrl: r.websiteUrl,
    timezone: r.timezone,
    locale: r.locale,
    currency: r.currency,
  };
}
export const emailTemplateVersions = pgTable(
  'email_template_version',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    templateKey: text('template_key').notNull(),
    version: integer('version').notNull(),
    locale: text('locale').notNull(),
    subject: text('subject').notNull(),
    textBody: text('text_body').notNull(),
    htmlBody: text('html_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('email_template_version_org_id_unique').on(t.organizationId, t.id),
    unique('email_template_version_org_full_unique').on(
      t.organizationId,
      t.id,
      t.templateKey,
      t.version,
      t.locale,
    ),
    unique('email_template_version_org_key_version_locale_unique').on(
      t.organizationId,
      t.templateKey,
      t.version,
      t.locale,
    ),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
      name: 'email_template_version_org_fk',
    }).onDelete('cascade'),
    check(
      'email_template_version_key_check',
      sql`${t.templateKey} in ('verification','registration-resume','entry-received','accepted','rejected','status-change')`,
    ),
    check('email_template_version_version_check', sql`${t.version} > 0`),
    check(
      'email_template_version_locale_check',
      sql`${t.locale} in ('de','en')`,
    ),
  ],
);
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id'),
    registrationGroupId: uuid('registration_group_id'),
    templateKey: text('template_key').notNull(),
    templateVersion: integer('template_version').notNull(),
    templateVersionId: uuid('template_version_id'),
    locale: text('locale').notNull(),
    recipient: text('recipient').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    variables: jsonb('variables')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('email_outbox_org_id_unique').on(t.organizationId, t.id),
    unique('email_outbox_org_idempotency_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
      name: 'email_outbox_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'email_outbox_org_event_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'email_outbox_org_event_group_fk',
    }),
    foreignKey({
      columns: [
        t.organizationId,
        t.templateVersionId,
        t.templateKey,
        t.templateVersion,
        t.locale,
      ],
      foreignColumns: [
        emailTemplateVersions.organizationId,
        emailTemplateVersions.id,
        emailTemplateVersions.templateKey,
        emailTemplateVersions.version,
        emailTemplateVersions.locale,
      ],
      name: 'email_outbox_org_template_fk',
    }),
    check('email_outbox_version_check', sql`${t.templateVersion} > 0`),
    check('email_outbox_attempts_check', sql`${t.attempts} >= 0`),
    check(
      'email_outbox_template_key_check',
      sql`${t.templateKey} in ('verification','registration-resume','entry-received','accepted','rejected','status-change')`,
    ),
    check('email_outbox_locale_check', sql`${t.locale} in ('de','en')`),
    check(
      'email_outbox_status_check',
      sql`${t.status} in ('pending','sending','sent','failed')`,
    ),
    index('email_outbox_due_idx')
      .on(t.availableAt)
      .where(sql`${t.status} in ('pending','sending')`),
    index('email_outbox_registration_group_idx')
      .on(t.organizationId, t.eventId, t.registrationGroupId)
      .where(sql`${t.registrationGroupId} is not null`),
  ],
);
export const emailDeliveries = pgTable(
  'email_delivery',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    outboxId: uuid('outbox_id').notNull(),
    attempt: integer('attempt').notNull(),
    outcome: text('outcome').notNull(),
    error: text('error'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.outboxId],
      foreignColumns: [emailOutbox.organizationId, emailOutbox.id],
      name: 'email_delivery_org_outbox_fk',
    }).onDelete('cascade'),
    unique('email_delivery_org_attempt_unique').on(
      t.organizationId,
      t.outboxId,
      t.attempt,
    ),
    check(
      'email_delivery_outcome_check',
      sql`${t.outcome} in ('sent','retry','failed')`,
    ),
  ],
);

export function createOrganizationRepository(
  db: Database,
): OrganizationRepository {
  return {
    getById: async (ctx) => {
      const [r] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      return r ? mapOrg(r) : null;
    },
    update: async (ctx, patch: OrganizationPatch) => {
      const [r] = await db
        .update(organizations)
        .set({
          ...('contactEmail' in patch
            ? { contactEmail: patch.contactEmail }
            : {}),
          ...('websiteUrl' in patch ? { websiteUrl: patch.websiteUrl } : {}),
          ...('name' in patch ? { name: patch.name } : {}),
          ...('timezone' in patch ? { timezone: patch.timezone } : {}),
          ...('locale' in patch ? { locale: patch.locale } : {}),
          ...('currency' in patch ? { currency: patch.currency } : {}),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, ctx.organizationId))
        .returning();
      return r ? mapOrg(r) : null;
    },
  };
}
export function createEventRepository(db: Database): EventRepository {
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
export function createMembershipRepository(db: Database): MembershipRepository {
  return {
    resolvePermissions: async (
      identity: ExternalIdentity,
      orgId,
      bootstrap?: MembershipBootstrap,
    ) =>
      db.transaction(async (tx) => {
        const isBootstrapCandidate =
          bootstrap?.issuer === identity.issuer &&
          (bootstrap.subject === identity.subject ||
            (bootstrap.email?.toLowerCase() === identity.email?.toLowerCase() &&
              identity.emailVerified === true));
        if (isBootstrapCandidate) {
          // Serialize first-admin attempts per organization. Disabled memberships
          // still count as history and must permanently close bootstrap.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`racepilot.membership.bootstrap:${orgId}`}, 0))`,
          );
        }
        const [stored] = await tx
          .insert(userIdentities)
          .values({
            issuer: identity.issuer,
            subject: identity.subject,
            email: identity.email ?? null,
            emailVerified: identity.emailVerified ?? false,
            displayName: identity.displayName ?? null,
          })
          .onConflictDoUpdate({
            target: [userIdentities.issuer, userIdentities.subject],
            set: {
              email: identity.email ?? null,
              emailVerified: identity.emailVerified ?? false,
              displayName: identity.displayName ?? null,
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!stored) return new Set<string>();
        if (isBootstrapCandidate) {
          const [existingMembership] = await tx
            .select({ userIdentityId: organizationMemberships.userIdentityId })
            .from(organizationMemberships)
            .where(eq(organizationMemberships.organizationId, orgId))
            .limit(1);
          if (!existingMembership) {
            await tx
              .insert(organizationMemberships)
              .values({
                organizationId: orgId,
                userIdentityId: stored.id,
                role: 'admin',
                status: 'active',
              })
              .onConflictDoNothing();
          }
        }
        const [membership] = await tx
          .select({ role: organizationMemberships.role })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, orgId),
              eq(organizationMemberships.userIdentityId, stored.id),
              eq(organizationMemberships.status, 'active'),
            ),
          );
        if (!membership) return new Set<string>();
        if (membership.role !== 'admin' && membership.role !== 'member')
          return new Set<string>();
        return permissionsForRole(membership.role);
      }),
  };
}
export async function createDatabase(databaseUrl: string) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool), pool: pool as Pool };
}

function mapPerson(
  row: typeof people.$inferSelect,
): import('@racepilot/core').Person {
  return {
    ...row,
    organizationId: organizationId(row.organizationId),
    dateOfBirth: row.dateOfBirth ?? null,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
function mapVehicle(
  row: typeof vehicles.$inferSelect,
): import('@racepilot/core').Vehicle {
  return {
    ...row,
    organizationId: organizationId(row.organizationId),
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
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

export function createPersonRepository(
  db: Database,
): import('@racepilot/core').PersonRepository {
  return {
    create: async (ctx, input) => {
      const firstName = input.firstName.trim();
      const lastName = input.lastName.trim();
      if (!firstName || !lastName) throw new Error('Person name is required');
      const normalized =
        input.email == null ? null : normalizeEmail(input.email);
      const [row] = await db
        .insert(people)
        .values({
          organizationId: ctx.organizationId,
          firstName,
          lastName,
          email: input.email?.trim() ?? null,
          emailNormalized: normalized,
          dateOfBirth: input.dateOfBirth,
          country: input.country ?? null,
        })
        .returning();
      return mapPerson(row!);
    },
    getById: async (ctx, id) => {
      const [row] = await db
        .select()
        .from(people)
        .where(
          and(
            eq(people.organizationId, ctx.organizationId),
            eq(people.id, id),
            sql`${people.deletedAt} is null`,
          ),
        );
      return row ? mapPerson(row) : null;
    },
    softDelete: async (ctx, id, reason) => {
      if (!reason.trim()) throw new Error('Deletion reason is required');
      const [row] = await db
        .update(people)
        .set({ deletedAt: new Date(), deletionReason: reason.trim() })
        .where(
          and(
            eq(people.organizationId, ctx.organizationId),
            eq(people.id, id),
            sql`${people.deletedAt} is null`,
          ),
        )
        .returning();
      return row ? mapPerson(row) : null;
    },
    findDuplicate: async (ctx, email, firstName, lastName, dateOfBirth) => {
      const normalizedEmail = email == null ? null : normalizeEmail(email);
      const [emailRow] = normalizedEmail
        ? await db
            .select()
            .from(people)
            .where(
              and(
                eq(people.organizationId, ctx.organizationId),
                eq(people.emailNormalized, normalizedEmail),
                sql`${people.deletedAt} is null`,
              ),
            )
            .limit(1)
        : [];
      const [nameRow] = dateOfBirth
        ? await db
            .select()
            .from(people)
            .where(
              and(
                eq(people.organizationId, ctx.organizationId),
                sql`lower(${people.firstName}) = lower(${firstName.trim()})`,
                sql`lower(${people.lastName}) = lower(${lastName.trim()})`,
                eq(people.dateOfBirth, dateOfBirth),
                sql`${people.deletedAt} is null`,
              ),
            )
            .limit(1)
        : [];
      return {
        person: emailRow ? mapPerson(emailRow) : null,
        nameAndBirthdateMatch: Boolean(nameRow),
      };
    },
  };
}
export function createVehicleRepository(
  db: Database,
): import('@racepilot/core').VehicleRepository {
  return {
    create: async (ctx, input) => {
      const [row] = await db
        .insert(vehicles)
        .values({
          organizationId: ctx.organizationId,
          make: input.make.trim(),
          model: input.model.trim(),
          year: input.year ?? null,
          registration: input.registration?.trim() ?? null,
        })
        .returning();
      return mapVehicle(row!);
    },
    getById: async (ctx, id) => {
      const [row] = await db
        .select()
        .from(vehicles)
        .where(
          and(
            eq(vehicles.organizationId, ctx.organizationId),
            eq(vehicles.id, id),
            sql`${vehicles.deletedAt} is null`,
          ),
        );
      return row ? mapVehicle(row) : null;
    },
    softDelete: async (ctx, id, reason) => {
      if (!reason.trim()) throw new Error('Deletion reason is required');
      const [row] = await db
        .update(vehicles)
        .set({ deletedAt: new Date(), deletionReason: reason.trim() })
        .where(
          and(
            eq(vehicles.organizationId, ctx.organizationId),
            eq(vehicles.id, id),
            sql`${vehicles.deletedAt} is null`,
          ),
        )
        .returning();
      return row ? mapVehicle(row) : null;
    },
  };
}
export function createEntryExportRepository(
  db: Database,
): import('@racepilot/core').EntryExportRepository {
  return {
    listByEvent: async (ctx, eventId) => {
      const rows = await db
        .select({
          driverFirst: people.firstName,
          driverLast: people.lastName,
          make: vehicles.make,
          model: vehicles.model,
          className: eventClasses.name,
          startNumber: entries.requestedStartNumber,
          status: entries.acceptanceStatus,
          priceSnapshot: entries.priceSnapshot,
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
          vehicles,
          and(
            eq(vehicles.organizationId, entries.organizationId),
            eq(vehicles.id, entries.vehicleId),
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
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.eventId, eventId),
            sql`${entries.deletedAt} is null`,
          ),
        );
      return rows.map((row) => ({
        driver: `${row.driverFirst} ${row.driverLast}`,
        vehicle: `${row.make} ${row.model}`,
        class: row.className,
        startNumber: row.startNumber,
        status: row.status as import('@racepilot/core').EntryAcceptanceStatus,
        priceCents: row.priceSnapshot?.totalCents ?? null,
      }));
    },
  };
}

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

export function createInvoicePaymentRepository(
  db: Database,
): InvoicePaymentRepository {
  return {
    record: async (ctx, invoiceId, amountCents, actor, reason) =>
      db.transaction(async (tx) => {
        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, invoiceId),
            ),
          )
          .for('update');
        if (!invoice || invoice.status === 'cancelled') return null;
        const [payment] = await tx
          .insert(invoicePayments)
          .values({
            organizationId: ctx.organizationId,
            invoiceId,
            amountCents,
            actor,
            reason,
          })
          .returning();
        await tx.insert(invoicePaymentAuditEvents).values({
          organizationId: ctx.organizationId,
          paymentId: payment!.id,
          action: 'recorded',
          actor,
          reason,
        });
        const sums = await tx
          .select({
            total: sql<number>`coalesce(sum(${invoicePayments.amountCents}),0)`,
          })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.invoiceId, invoiceId),
            ),
          );
        const status = deriveInvoiceStatus(
          invoice.totalCents,
          Number(sums[0]?.total ?? 0),
        );
        await tx
          .update(invoices)
          .set({ status })
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, invoiceId),
            ),
          );
        return payment;
      }),
    correct: async (ctx, paymentId, actor, reason) =>
      db.transaction(async (tx) => {
        const [original] = await tx
          .select()
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.id, paymentId),
            ),
          )
          .for('update');
        if (!original || original.reversesPaymentId !== null) return null;
        const [alreadyReversed] = await tx
          .select({ id: invoicePayments.id })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.reversesPaymentId, paymentId),
            ),
          )
          .limit(1);
        if (alreadyReversed) return null;
        const [reversal] = await tx
          .insert(invoicePayments)
          .values({
            organizationId: ctx.organizationId,
            invoiceId: original.invoiceId,
            amountCents: -original.amountCents,
            reversesPaymentId: original.id,
            actor,
            reason,
          })
          .returning();
        await tx.insert(invoicePaymentAuditEvents).values({
          organizationId: ctx.organizationId,
          paymentId: reversal!.id,
          action: 'reversal',
          actor,
          reason,
        });
        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, original.invoiceId),
            ),
          );
        const sums = await tx
          .select({
            total: sql<number>`coalesce(sum(${invoicePayments.amountCents}),0)`,
          })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.invoiceId, original.invoiceId),
            ),
          );
        if (invoice)
          await tx
            .update(invoices)
            .set({
              status: deriveInvoiceStatus(
                invoice.totalCents,
                Number(sums[0]?.total ?? 0),
              ),
            })
            .where(
              and(
                eq(invoices.organizationId, ctx.organizationId),
                eq(invoices.id, original.invoiceId),
              ),
            );
        return reversal;
      }),
  };
}

export function createPaymentRecipientRepository(
  db: Database,
): PaymentRecipientRepository {
  return {
    get: async (ctx) => {
      const [row] = await db
        .select()
        .from(organizationPaymentRecipients)
        .where(
          eq(organizationPaymentRecipients.organizationId, ctx.organizationId),
        );
      return row
        ? { accountName: row.accountName, iban: row.iban, bic: row.bic }
        : null;
    },
    set: async (ctx, recipient: PaymentRecipient) => {
      const [row] = await db
        .insert(organizationPaymentRecipients)
        .values({
          organizationId: ctx.organizationId,
          accountName: recipient.accountName,
          iban: recipient.iban,
          bic: recipient.bic ?? null,
        })
        .onConflictDoUpdate({
          target: organizationPaymentRecipients.organizationId,
          set: {
            accountName: recipient.accountName,
            iban: recipient.iban,
            bic: recipient.bic ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return { accountName: row!.accountName, iban: row!.iban, bic: row!.bic };
    },
  };
}

export function createEventClassPricingRepository(
  db: Database,
): EventClassPricingRepository {
  return {
    listByEvent: async (ctx, eventId) =>
      (
        await db
          .select()
          .from(eventClassPricingRules)
          .where(
            and(
              eq(eventClassPricingRules.organizationId, ctx.organizationId),
              eq(eventClassPricingRules.eventId, eventId),
            ),
          )
      ).map((r) => ({
        classId: r.classId,
        baseCents: r.baseCents,
        additionalEntryAdjustmentCents: r.additionalEntryAdjustmentCents,
        earlyBirdDeadline: r.earlyBirdDeadline?.toISOString() ?? null,
        earlyBirdDiscountCents: r.earlyBirdDiscountCents,
      })),
    upsert: async (ctx, eventId, rule) => {
      const [r] = await db
        .insert(eventClassPricingRules)
        .values({
          organizationId: ctx.organizationId,
          eventId,
          classId: rule.classId,
          baseCents: rule.baseCents,
          additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
          earlyBirdDeadline: rule.earlyBirdDeadline
            ? new Date(rule.earlyBirdDeadline)
            : null,
          earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
        })
        .onConflictDoUpdate({
          target: [
            eventClassPricingRules.organizationId,
            eventClassPricingRules.eventId,
            eventClassPricingRules.classId,
          ],
          set: {
            baseCents: rule.baseCents,
            additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
            earlyBirdDeadline: rule.earlyBirdDeadline
              ? new Date(rule.earlyBirdDeadline)
              : null,
            earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
            updatedAt: new Date(),
          },
        })
        .returning();
      return {
        classId: r!.classId,
        baseCents: r!.baseCents,
        additionalEntryAdjustmentCents: r!.additionalEntryAdjustmentCents,
        earlyBirdDeadline: r!.earlyBirdDeadline?.toISOString() ?? null,
        earlyBirdDiscountCents: r!.earlyBirdDiscountCents,
      };
    },
  };
}
export function createInvoiceRepository(db: Database): InvoiceRepository {
  return {
    issue: async (ctx, eventId, registrationGroupId, snapshot, executor) => {
      const executorDb = (executor as Database | undefined) ?? db;
      const [counter] = await executorDb
        .insert(invoiceReferenceCounters)
        .values({ organizationId: ctx.organizationId, nextValue: 1 })
        .onConflictDoUpdate({
          target: invoiceReferenceCounters.organizationId,
          set: { nextValue: sql`${invoiceReferenceCounters.nextValue} + 1` },
        })
        .returning({ nextValue: invoiceReferenceCounters.nextValue });
      const paymentReference = createPaymentReference(
        String(counter!.nextValue).padStart(8, '0'),
      );
      const [row] = await executorDb
        .insert(invoices)
        .values({
          organizationId: ctx.organizationId,
          eventId,
          registrationGroupId,
          totalCents: snapshot.totalCents,
          currency: snapshot.currency,
          paymentReference,
        })
        .onConflictDoNothing({
          target: [invoices.organizationId, invoices.registrationGroupId],
        })
        .returning();
      const invoice =
        row ??
        (
          await executorDb
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.organizationId, ctx.organizationId),
                eq(invoices.registrationGroupId, registrationGroupId),
              ),
            )
        )[0];
      if (!invoice) throw new Error('Invoice creation failed');
      if (
        invoice.totalCents !== snapshot.totalCents ||
        invoice.currency !== snapshot.currency
      )
        throw new Error('Existing invoice does not match price snapshot');
      return {
        ...invoice,
        organizationId: organizationId(invoice.organizationId),
        status: invoice.status as InvoiceRecord['status'],
      };
    },
  };
}

/** Drizzle's database and transaction objects both satisfy this executor. */
export type MailOutboxExecutor = Pick<
  Database,
  'execute' | 'insert' | 'select'
>;
export interface NewMailOutboxMessage {
  eventId?: string | null;
  registrationGroupId?: string | null;
  templateKey: string;
  templateVersion: number;
  templateVersionId?: string | null;
  locale: 'de' | 'en';
  recipient: string;
  idempotencyKey: string;
  variables: Record<string, string>;
  correlationId?: string;
}
/** Call with the caller's Drizzle transaction to atomically enqueue with domain writes. */
export async function enqueueMailOutbox(
  db: Database,
  organization: string,
  input: NewMailOutboxMessage,
  executor: MailOutboxExecutor = db,
): Promise<string> {
  const [inserted] = await executor
    .insert(emailOutbox)
    .values({
      organizationId: organization,
      eventId: input.eventId ?? null,
      registrationGroupId: input.registrationGroupId ?? null,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      templateVersionId: input.templateVersionId ?? null,
      locale: input.locale,
      recipient: input.recipient,
      idempotencyKey: input.idempotencyKey,
      variables: input.variables,
    })
    .onConflictDoNothing({
      target: [emailOutbox.organizationId, emailOutbox.idempotencyKey],
    })
    .returning({ id: emailOutbox.id });
  if (inserted) {
    const envelope = {
      type: 'mail.outbox',
      schemaVersion: 1,
      organizationId: organization,
      correlationId: input.correlationId ?? input.idempotencyKey,
      payload: { outboxId: inserted.id },
    };
    await executor.execute(
      sql`select graphile_worker.add_job('mail_outbox', ${JSON.stringify(envelope)}::json, null, now(), 25, ${`mail-outbox:${inserted.id}`})`,
    );
    return inserted.id;
  }
  const [existing] = await executor
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.organizationId, organization),
        eq(emailOutbox.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error('Mail outbox enqueue failed');
  return existing.id;
}

export async function setOrganizationMailConfiguration(
  db: Database,
  organization: string,
  config: { from: string; replyTo?: string },
): Promise<void> {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (
    !email.test(config.from) ||
    (config.replyTo && !email.test(config.replyTo))
  )
    throw new Error('Invalid organization mail configuration');
  await db
    .update(organizations)
    .set({ mailFrom: config.from, mailReplyTo: config.replyTo ?? null })
    .where(eq(organizations.id, organization));
}

export async function getOrganizationMailConfiguration(
  db: Database,
  organization: string,
) {
  const [row] = await db
    .select({
      from: organizations.mailFrom,
      replyTo: organizations.mailReplyTo,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organization),
        eq(organizations.status, 'active'),
      ),
    )
    .limit(1);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return row?.from &&
    email.test(row.from) &&
    (row.replyTo === null || email.test(row.replyTo))
    ? { from: row.from, replyTo: row.replyTo }
    : null;
}

export async function saveMailTemplateVersion(
  db: Database,
  organization: string,
  input: {
    templateKey: string;
    version: number;
    locale: 'de' | 'en';
    subject: string;
    text: string;
    html: string;
  },
): Promise<string> {
  const [row] = await db
    .insert(emailTemplateVersions)
    .values({
      organizationId: organization,
      templateKey: input.templateKey,
      version: input.version,
      locale: input.locale,
      subject: input.subject,
      textBody: input.text,
      htmlBody: input.html,
    })
    .returning({ id: emailTemplateVersions.id });
  if (!row) throw new Error('Mail template version could not be stored');
  return row.id;
}

export function createMailOutboxRepository(
  db: Database,
  options: { leaseMs?: number } = {},
) {
  const leaseMs = options.leaseMs ?? 5 * 60_000;
  const mapOutbox = (row: typeof emailOutbox.$inferSelect) => ({
    id: row.id,
    organizationId: row.organizationId,
    eventId: row.eventId,
    templateKey: row.templateKey as
      | 'verification'
      | 'registration-resume'
      | 'entry-received'
      | 'accepted'
      | 'rejected'
      | 'status-change',
    templateVersion: row.templateVersion,
    locale: row.locale as 'de' | 'en',
    recipient: row.recipient,
    idempotencyKey: row.idempotencyKey,
    variables: row.variables,
    status: row.status as 'pending' | 'sending' | 'sent' | 'failed',
    attempts: row.attempts,
  });
  return {
    get: async (ctx: { organizationId: string }, id: string) => {
      const [row] = await db
        .select()
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.organizationId, ctx.organizationId),
            eq(emailOutbox.id, id),
          ),
        )
        .limit(1);
      return row ? mapOutbox(row) : null;
    },
    claim: async (ctx: { organizationId: string }, id: string) => {
      const [row] = await db
        .update(emailOutbox)
        .set({ status: 'sending', claimedAt: new Date() })
        .where(
          and(
            eq(emailOutbox.organizationId, ctx.organizationId),
            eq(emailOutbox.id, id),
            or(
              and(
                eq(emailOutbox.status, 'pending'),
                lte(emailOutbox.availableAt, sql`now()`),
              ),
              and(
                eq(emailOutbox.status, 'sending'),
                lt(
                  emailOutbox.claimedAt,
                  sql`now() - (${leaseMs} * interval '1 millisecond')`,
                ),
              ),
            ),
          ),
        )
        .returning();
      return row ? mapOutbox(row) : null;
    },
    template: async (
      ctx: { organizationId: string },
      key: string,
      version: number,
      locale: string,
    ) => {
      const [row] = await db
        .select({
          subject: emailTemplateVersions.subject,
          text: emailTemplateVersions.textBody,
          html: emailTemplateVersions.htmlBody,
        })
        .from(emailTemplateVersions)
        .where(
          and(
            eq(emailTemplateVersions.organizationId, ctx.organizationId),
            eq(emailTemplateVersions.templateKey, key),
            eq(emailTemplateVersions.version, version),
            eq(emailTemplateVersions.locale, locale),
          ),
        )
        .limit(1);
      return row
        ? { subject: row.subject, text: row.text, html: row.html }
        : null;
    },
    organizationMailConfig: async (ctx: { organizationId: string }) => {
      const [row] = await db
        .select({
          from: organizations.mailFrom,
          replyTo: organizations.mailReplyTo,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, ctx.organizationId),
            eq(organizations.status, 'active'),
          ),
        )
        .limit(1);
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return row?.from &&
        email.test(row.from) &&
        (row.replyTo === null ||
          (row.replyTo !== null && email.test(row.replyTo)))
        ? { from: row.from, replyTo: row.replyTo }
        : null;
    },
    finish: async (
      ctx: { organizationId: string },
      id: string,
      outcome: {
        outcome: 'sent' | 'retry' | 'failed';
        attempts: number;
        availableAt?: Date;
        error?: string;
      },
    ) => {
      await db.transaction(async (tx) => {
        await tx
          .update(emailOutbox)
          .set({
            status: outcome.outcome === 'retry' ? 'pending' : outcome.outcome,
            attempts: outcome.attempts,
            availableAt: outcome.availableAt ?? new Date(),
            sentAt: outcome.outcome === 'sent' ? new Date() : null,
            claimedAt: null,
            lastError: outcome.error ?? null,
          })
          .where(
            and(
              eq(emailOutbox.organizationId, ctx.organizationId),
              eq(emailOutbox.id, id),
              eq(emailOutbox.status, 'sending'),
            ),
          );
        await tx
          .insert(emailDeliveries)
          .values({
            organizationId: ctx.organizationId,
            outboxId: id,
            attempt: outcome.attempts,
            outcome: outcome.outcome,
            error: outcome.error ?? null,
          })
          .onConflictDoNothing();
        if (outcome.outcome === 'retry' && outcome.availableAt) {
          const envelope = {
            type: 'mail.outbox',
            schemaVersion: 1,
            organizationId: ctx.organizationId,
            correlationId: id,
            payload: { outboxId: id },
          };
          await tx.execute(sql`select graphile_worker.add_job(
            identifier := 'mail_outbox',
            payload := ${JSON.stringify(envelope)}::json,
            run_at := ${outcome.availableAt},
            job_key := ${`mail-outbox:${id}`},
            job_key_mode := 'replace'
          )`);
        }
      });
    },
  };
}

export type RegistrationSettings = {
  sharedContactEmail: 'allowed' | 'disallowed';
  minimumAge: number | null;
  guardianRequiredBelowAge: number;
  maximumClassesPerGroup: number;
};
export function createRegistrationSettingsRepository(db: Database) {
  return {
    get: async (ctx: RequestContext): Promise<RegistrationSettings> => {
      const [row] = await db
        .select({ settings: organizations.registrationSettings })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      return (
        row?.settings ?? {
          sharedContactEmail: 'allowed',
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        }
      );
    },
    update: async (
      ctx: RequestContext,
      settings: RegistrationSettings,
      actor: string,
    ): Promise<RegistrationSettings> =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({ settings: organizations.registrationSettings })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .for('update');
        if (!before) throw new Error('Organization not found');
        const [updated] = await tx
          .update(organizations)
          .set({ registrationSettings: settings, updatedAt: new Date() })
          .where(eq(organizations.id, ctx.organizationId))
          .returning({ settings: organizations.registrationSettings });
        await tx.insert(registrationSettingsAudit).values({
          organizationId: ctx.organizationId,
          actor,
          beforeSettings: before.settings,
          afterSettings: settings,
        });
        return updated!.settings;
      }),
  };
}

export function createRegistrationFormConfigRepository(db: Database) {
  return {
    getOrganization: async (ctx: RequestContext) => {
      const [row] = await db
        .select({ config: organizations.registrationFormConfig })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      return row?.config ?? null;
    },
    updateOrganization: async (
      ctx: RequestContext,
      config: Record<string, unknown>,
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({ config: organizations.registrationFormConfig })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .for('update');
        if (!before) return null;
        const [after] = await tx
          .update(organizations)
          .set({ registrationFormConfig: config, updatedAt: new Date() })
          .where(eq(organizations.id, ctx.organizationId))
          .returning({ config: organizations.registrationFormConfig });
        await tx.insert(registrationFormConfigAudit).values({
          organizationId: ctx.organizationId,
          actor,
          beforeConfig: before.config,
          afterConfig: config,
        });
        return after?.config ?? null;
      }),
    getEvent: async (ctx: RequestContext, eventId: string) => {
      const [row] = await db
        .select({ config: events.registrationFormConfig })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        );
      return row?.config ?? null;
    },
    updateEvent: async (
      ctx: RequestContext,
      eventId: string,
      config: Record<string, unknown>,
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({ config: events.registrationFormConfig })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, eventId),
            ),
          )
          .for('update');
        if (!before) return null;
        const [after] = await tx
          .update(events)
          .set({ registrationFormConfig: config, updatedAt: new Date() })
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, eventId),
            ),
          )
          .returning({ config: events.registrationFormConfig });
        await tx.insert(registrationFormConfigAudit).values({
          organizationId: ctx.organizationId,
          eventId,
          actor,
          beforeConfig: before.config,
          afterConfig: config,
        });
        return after?.config ?? null;
      }),
  };
}

export interface PublicRegistrationPayload {
  submissionId: string;
  formVersion: '1.0';
  eventSlug: string;
  language: 'de' | 'en';
  person: {
    firstName: string;
    lastName: string;
    email: string;
    dateOfBirth: string;
    country?: string | undefined;
    guardianName?: string | undefined;
    guardianEmail?: string | undefined;
  };
  customAnswers?: Record<
    string,
    string | boolean | { objectId: string; uploadToken: string }
  >;
  entries: Array<{
    classId: string;
    requestedStartNumber?: string | null | undefined;
    vehicle: {
      make: string;
      model: string;
      year: number | null;
      registration: string | null;
    };
  }>;
  consents: Array<{
    key: string;
    version: string;
    hash: string;
    accepted: true;
  }>;
}
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
export function createEntryWorkflowRepository(
  db: Database,
): import('@racepilot/core').EntryWorkflowRepository {
  const map = (row: {
    id: string;
    organization_id: string;
    event_id: string | null;
    version: number;
    workflow: import('@racepilot/core').EntryWorkflow;
  }) => ({
    id: row.id,
    organizationId: organizationId(row.organization_id),
    eventId: row.event_id,
    version: row.version,
    workflow: normalizeEntryWorkflow(row.workflow),
  });
  return {
    getOrganization: async (ctx) => {
      const result = await db.execute(
        sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id WHERE c.organization_id=${ctx.organizationId} AND c.event_id IS NULL`,
      );
      const row = (result as unknown as { rows: Parameters<typeof map>[0][] })
        .rows[0];
      return row ? map(row) : null;
    },
    getEffective: async (ctx, eventId) => {
      const result = await db.execute(
        sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id JOIN event e ON e.organization_id=c.organization_id AND e.id=c.event_id WHERE c.organization_id=${ctx.organizationId} AND c.event_id=${eventId} UNION ALL SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id JOIN event e ON e.organization_id=c.organization_id AND e.id=${eventId} WHERE c.organization_id=${ctx.organizationId} AND c.event_id IS NULL AND NOT EXISTS (SELECT 1 FROM entry_workflow_current x WHERE x.organization_id=c.organization_id AND x.event_id=e.id) LIMIT 1`,
      );
      const row = (result as unknown as { rows: Parameters<typeof map>[0][] })
        .rows[0];
      return row ? map(row) : null;
    },
    getPinnedForEntry: async (ctx, entryId) => {
      const result = await db.execute(
        sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry e JOIN entry_workflow_revision r ON r.organization_id=e.organization_id AND r.id=e.workflow_revision_id WHERE e.organization_id=${ctx.organizationId} AND e.id=${entryId} AND e.deleted_at IS NULL`,
      );
      const row = (result as unknown as { rows: Parameters<typeof map>[0][] })
        .rows[0];
      return row ? map(row) : null;
    },
    setOrganization: async (ctx, workflow, actor, reason) =>
      db.transaction(async (tx) => {
        const current = await tx.execute(
          sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id WHERE c.organization_id=${ctx.organizationId} AND c.event_id IS NULL FOR UPDATE OF c`,
        );
        const old = (
          current as unknown as { rows: Parameters<typeof map>[0][] }
        ).rows[0];
        if (!old) throw new Error('Organization workflow not found');
        const inserted = await tx.execute(
          sql`INSERT INTO entry_workflow_revision (organization_id,event_id,version,workflow,actor,reason) VALUES (${ctx.organizationId},NULL,${old.version + 1},${JSON.stringify(workflow)}::jsonb,${actor},${reason}) RETURNING id, organization_id, event_id, version, workflow`,
        );
        const revision = (
          inserted as unknown as { rows: Parameters<typeof map>[0][] }
        ).rows[0];
        if (!revision) throw new Error('Workflow revision insert failed');
        await tx.execute(
          sql`UPDATE entry_workflow_current SET workflow_revision_id=${revision.id} WHERE organization_id=${ctx.organizationId} AND event_id IS NULL`,
        );
        await tx.execute(
          sql`INSERT INTO entry_workflow_audit (organization_id,event_id,workflow_revision_id,actor,reason) VALUES (${ctx.organizationId},NULL,${revision.id},${actor},${reason})`,
        );
        return map(revision);
      }),
    setEvent: async (ctx, eventId, workflow, actor, reason) =>
      db.transaction(async (tx) => {
        const current = await tx.execute(
          sql`SELECT r.id, r.organization_id, r.event_id, r.version, r.workflow FROM entry_workflow_current c JOIN entry_workflow_revision r ON r.organization_id=c.organization_id AND r.id=c.workflow_revision_id JOIN event e ON e.organization_id=c.organization_id AND e.id=c.event_id WHERE c.organization_id=${ctx.organizationId} AND c.event_id=${eventId} FOR UPDATE OF c`,
        );
        const old = (
          current as unknown as { rows: Parameters<typeof map>[0][] }
        ).rows[0];
        if (!old) return null;
        const inserted = await tx.execute(
          sql`INSERT INTO entry_workflow_revision (organization_id,event_id,version,workflow,actor,reason) VALUES (${ctx.organizationId},${eventId},${old.version + 1},${JSON.stringify(workflow)}::jsonb,${actor},${reason}) RETURNING id, organization_id, event_id, version, workflow`,
        );
        const revision = (
          inserted as unknown as { rows: Parameters<typeof map>[0][] }
        ).rows[0];
        if (!revision) throw new Error('Workflow revision insert failed');
        await tx.execute(
          sql`UPDATE entry_workflow_current SET workflow_revision_id=${revision.id} WHERE organization_id=${ctx.organizationId} AND event_id=${eventId}`,
        );
        await tx.execute(
          sql`INSERT INTO entry_workflow_audit (organization_id,event_id,workflow_revision_id,actor,reason) VALUES (${ctx.organizationId},${eventId},${revision.id},${actor},${reason})`,
        );
        return map(revision);
      }),
  };
}

/** Event-scoped status dimensions and audited per-entry status markers. */
export function createEntryStatusDimensionRepository(
  db: Database,
): import('@racepilot/core').EntryStatusDimensionRepository {
  return {
    getEvent: async (ctx, eventId) => {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .limit(1);
      if (!event) return null;
      const [row] = await db
        .select({ config: eventEntryStatusDimensionConfigs.config })
        .from(eventEntryStatusDimensionConfigs)
        .where(
          and(
            eq(
              eventEntryStatusDimensionConfigs.organizationId,
              ctx.organizationId,
            ),
            eq(eventEntryStatusDimensionConfigs.eventId, eventId),
          ),
        )
        .limit(1);
      return row?.config ?? defaultEntryStatusDimensionConfig;
    },
    setEvent: async (ctx, eventId, config, actor, reason) => {
      if (!ctx.permissions.has('event:write')) throw new Error('Forbidden');
      if (!actor.trim() || !reason.trim())
        throw new Error('Actor and reason are required');
      const errors = validateEntryStatusDimensionConfig(config);
      if (errors.length)
        throw new Error(
          `Invalid status dimension config: ${errors.join('; ')}`,
        );
      return db.transaction(async (tx) => {
        const [event] = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, eventId),
            ),
          )
          .for('update')
          .limit(1);
        if (!event) return null;
        const [old] = await tx
          .select({ config: eventEntryStatusDimensionConfigs.config })
          .from(eventEntryStatusDimensionConfigs)
          .where(
            and(
              eq(
                eventEntryStatusDimensionConfigs.organizationId,
                ctx.organizationId,
              ),
              eq(eventEntryStatusDimensionConfigs.eventId, eventId),
            ),
          )
          .limit(1);
        const stateRows = await tx
          .select({
            dimension: entryStatusDimensionValues.dimension,
            value: entryStatusDimensionValues.value,
          })
          .from(entryStatusDimensionValues)
          .where(
            and(
              eq(entryStatusDimensionValues.organizationId, ctx.organizationId),
              eq(entryStatusDimensionValues.eventId, eventId),
            ),
          );
        for (const state of stateRows) {
          const dimension = config.dimensions.find(
            (item) => item.key === state.dimension,
          );
          if (!dimension?.values.some((item) => item.key === state.value))
            throw new EntryStatusInUseError(
              state.dimension as import('@racepilot/core').EntryStatusDimensionKey,
              state.value,
            );
        }
        await tx
          .insert(eventEntryStatusDimensionConfigs)
          .values({
            organizationId: ctx.organizationId,
            eventId,
            config,
            actor: actor.trim(),
            reason: reason.trim(),
          })
          .onConflictDoUpdate({
            target: [
              eventEntryStatusDimensionConfigs.organizationId,
              eventEntryStatusDimensionConfigs.eventId,
            ],
            set: {
              config,
              actor: actor.trim(),
              reason: reason.trim(),
              updatedAt: new Date(),
            },
          });
        await tx.insert(eventEntryStatusDimensionConfigAudit).values({
          organizationId: ctx.organizationId,
          eventId,
          beforeConfig: old?.config ?? null,
          afterConfig: config,
          actor: actor.trim(),
          reason: reason.trim(),
        });
        return config;
      });
    },
    transition: async (ctx, entryId, dimension, to, actor, reason) => {
      if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
      if (!actor.trim() || !reason.trim())
        throw new Error('Actor and reason are required');
      return db.transaction(async (tx) => {
        // Match setEvent's lock order: serialize on the event, then lock the entry.
        // event_id is immutable; this unlocked lookup only discovers the lock key.
        const [identity] = await tx
          .select({ eventId: entries.eventId })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, entryId),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .limit(1);
        if (!identity) return null;
        const [event] = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, identity.eventId),
            ),
          )
          .for('update')
          .limit(1);
        if (!event) return null;
        const [entry] = await tx
          .select({ eventId: entries.eventId })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.eventId, event.id),
              eq(entries.id, entryId),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .for('update')
          .limit(1);
        if (!entry) return null;
        const [configured] = await tx
          .select({ config: eventEntryStatusDimensionConfigs.config })
          .from(eventEntryStatusDimensionConfigs)
          .where(
            and(
              eq(
                eventEntryStatusDimensionConfigs.organizationId,
                ctx.organizationId,
              ),
              eq(eventEntryStatusDimensionConfigs.eventId, entry.eventId),
            ),
          )
          .limit(1);
        const config = configured?.config ?? defaultEntryStatusDimensionConfig;
        const definition = config.dimensions.find(
          (item) => item.key === dimension,
        );
        const target = definition?.values.find((item) => item.key === to);
        if (!definition || !target) throw new Error('Unknown status value');
        const [current] = await tx
          .select({ value: entryStatusDimensionValues.value })
          .from(entryStatusDimensionValues)
          .where(
            and(
              eq(entryStatusDimensionValues.organizationId, ctx.organizationId),
              eq(entryStatusDimensionValues.entryId, entryId),
              eq(entryStatusDimensionValues.dimension, dimension),
            ),
          )
          .limit(1);
        const from =
          current?.value ?? (dimension === 'waiver' ? 'f_pending' : 'pending');
        if (
          !definition.transitions.some(
            (edge) => edge.from === from && edge.to === to,
          )
        )
          throw new Error(`Invalid ${dimension} transition: ${from} -> ${to}`);
        await tx
          .insert(entryStatusDimensionValues)
          .values({
            organizationId: ctx.organizationId,
            eventId: entry.eventId,
            entryId,
            dimension,
            value: to,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              entryStatusDimensionValues.organizationId,
              entryStatusDimensionValues.entryId,
              entryStatusDimensionValues.dimension,
            ],
            set: { value: to, updatedAt: new Date() },
          });
        await tx.insert(entryStatusDimensionAudit).values({
          organizationId: ctx.organizationId,
          eventId: entry.eventId,
          entryId,
          dimension,
          fromValue: from,
          toValue: to,
          actor: actor.trim(),
          reason: reason.trim(),
        });
        return true;
      });
    },
    updateHints: async (ctx, entryId, hints, actor, reason) => {
      if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
      if (!actor.trim() || !reason.trim())
        throw new Error('Actor and reason are required');
      const allowed = new Set<EntryStatusHintKey>([
        'double_starter',
        'passenger',
        'late_entry',
      ]);
      if (
        !Object.keys(hints).length ||
        Object.entries(hints).some(
          ([key, value]) =>
            !allowed.has(key as EntryStatusHintKey) ||
            typeof value !== 'boolean',
        )
      )
        throw new Error('Invalid status hint');
      return db.transaction(async (tx) => {
        const [entry] = await tx
          .select({ eventId: entries.eventId, hints: entries.statusHints })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, entryId),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .for('update')
          .limit(1);
        if (!entry) return false;
        const after = { ...entry.hints, ...hints };
        await tx
          .update(entries)
          .set({ statusHints: after })
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, entryId),
            ),
          );
        await tx.insert(entryStatusHintsAudit).values({
          organizationId: ctx.organizationId,
          eventId: entry.eventId,
          entryId,
          beforeHints: entry.hints,
          afterHints: after,
          actor: actor.trim(),
          reason: reason.trim(),
        });
        return true;
      });
    },
  };
}

export interface TimingMeasurementInput {
  readonly entryId: string;
  readonly run: number;
  readonly timeMs: number;
  readonly penaltyMs?: number;
  readonly exclusion?: 'DNF' | 'DNS' | 'DSQ' | null;
  readonly source: string;
  readonly recordedAt: string;
}
export interface TimingMeasurementRecord extends TimingMeasurementInput {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly version: number;
  readonly supersedesId: string | null;
  readonly active: boolean;
  readonly recordedBy: string;
}
export interface TimingRepository {
  listEntries(
    ctx: RequestContext,
    eventId: string,
  ): Promise<
    { entryId: string; startNumber: string; statusCategory: string | null }[]
  >;
  record(
    ctx: RequestContext,
    eventId: string,
    input: TimingMeasurementInput,
    actor: string,
  ): Promise<TimingMeasurementRecord | null>;
  recordMany(
    ctx: RequestContext,
    eventId: string,
    input: readonly TimingMeasurementInput[],
    actor: string,
  ): Promise<TimingMeasurementRecord[]>;
  list(
    ctx: RequestContext,
    eventId: string,
  ): Promise<TimingMeasurementRecord[]>;
  correct(
    ctx: RequestContext,
    eventId: string,
    measurementId: string,
    input: Partial<TimingMeasurementInput>,
    actor: string,
  ): Promise<TimingMeasurementRecord | null>;
  resolveEntry(
    ctx: RequestContext,
    eventId: string,
    lookup: { entryId?: string; startNumber?: string },
  ): Promise<{ entryId: string; startNumber: string } | null>;
  createDraft(
    ctx: RequestContext,
    eventId: string,
    rule: unknown,
    results: unknown,
    actor: string,
  ): Promise<TimingResultVersion | null>;
  publish(
    ctx: RequestContext,
    eventId: string,
    version: number,
    actor: string,
  ): Promise<TimingResultVersion | null>;
  latestPublished(
    ctx: RequestContext,
    eventId: string,
  ): Promise<TimingResultVersion | null>;
}
export interface TimingResultVersion {
  readonly eventId: string;
  readonly version: number;
  readonly status: 'draft' | 'published';
  readonly rule: unknown;
  readonly results: unknown;
  readonly actor: string;
  readonly createdAt: string;
  readonly publishedAt: string | null;
}
type TimingDbRow = {
  id: string;
  organization_id: string;
  event_id: string;
  entry_id: string;
  run: number;
  time_ms: number;
  penalty_ms: number;
  exclusion: 'DNF' | 'DNS' | 'DSQ' | null;
  source: string;
  recorded_at: Date | string;
  recorded_by: string;
  version: number;
  supersedes_id: string | null;
  active: boolean;
};
const mapTimingRow = (row: TimingDbRow): TimingMeasurementRecord => ({
  id: row.id,
  organizationId: row.organization_id,
  eventId: row.event_id,
  entryId: row.entry_id,
  run: row.run,
  timeMs: row.time_ms,
  penaltyMs: row.penalty_ms,
  ...(row.exclusion ? { exclusion: row.exclusion } : {}),
  source: row.source,
  recordedAt: new Date(row.recorded_at).toISOString(),
  recordedBy: row.recorded_by,
  version: row.version,
  supersedesId: row.supersedes_id,
  active: row.active,
});
type TimingResultDbRow = {
  event_id: string;
  version: number;
  status: 'draft' | 'published';
  rule: unknown;
  results: unknown;
  actor: string;
  created_at: Date | string;
  published_at: Date | string | null;
};
const mapTimingResult = (r: TimingResultDbRow): TimingResultVersion => ({
  eventId: r.event_id,
  version: r.version,
  status: r.status,
  rule: r.rule,
  results: r.results,
  actor: r.actor,
  createdAt: new Date(r.created_at).toISOString(),
  publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
});
const timingUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDuplicateTimingRun = (error: unknown) => {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const candidate = current as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      candidate.code === '23505' ||
      candidate.constraint === 'timing_measurement_one_active_run'
    )
      return true;
    if (candidate.message?.includes('timing_measurement_one_active_run'))
      return true;
    current = candidate.cause;
  }
  return false;
};
export function createTimingRepository(db: Database): TimingRepository {
  const insert = async (
    tx: Database,
    ctx: RequestContext,
    eventId: string,
    input: TimingMeasurementInput,
    actor: string,
    previousId: string | null,
  ) => {
    const versionResult =
      await tx.execute(sql`SELECT COALESCE(MAX(version), 0) + 1 AS version
      FROM timing_measurement WHERE organization_id=${ctx.organizationId} AND event_id=${eventId}
      AND entry_id=${input.entryId} AND run=${input.run}`);
    const version = Number(
      (versionResult as unknown as { rows: { version: number }[] }).rows[0]
        ?.version ?? 1,
    );
    const result = await tx.execute(sql`INSERT INTO timing_measurement
      (organization_id,event_id,entry_id,run,time_ms,penalty_ms,exclusion,source,recorded_at,recorded_by,version,supersedes_id)
      SELECT ${ctx.organizationId},${eventId},${input.entryId},${input.run},${input.timeMs},${input.penaltyMs ?? 0},
      ${input.exclusion ?? null},${input.source},${input.recordedAt}::timestamptz,${actor},${version},${previousId}
      WHERE EXISTS (SELECT 1 FROM event WHERE organization_id=${ctx.organizationId} AND id=${eventId})
      AND EXISTS (SELECT 1 FROM entry WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} AND id=${input.entryId})
      RETURNING *`);
    const row = (result as unknown as { rows: TimingDbRow[] }).rows[0];
    if (!row) return null;
    await tx.execute(sql`INSERT INTO timing_audit (organization_id,event_id,measurement_id,action,actor,details)
      VALUES (${ctx.organizationId},${eventId},${row.id},${previousId ? 'correct' : 'record'},${actor},
      ${JSON.stringify({ run: input.run, version })}::jsonb)`);
    return mapTimingRow(row);
  };
  return {
    listEntries: async (ctx, eventId) => {
      if (!timingUuid.test(eventId)) return [];
      const result = await db.execute(sql`SELECT e.id, e.requested_start_number,
        status.value->>'category' AS status_category
        FROM entry e
        LEFT JOIN entry_workflow_revision w ON w.organization_id=e.organization_id AND w.id=e.workflow_revision_id
        LEFT JOIN LATERAL jsonb_array_elements(COALESCE(w.workflow->'statuses', '[]'::jsonb)) AS status(value)
          ON status.value->>'key'=e.acceptance_status
        WHERE e.organization_id=${ctx.organizationId} AND e.event_id=${eventId} AND e.deleted_at IS NULL
        ORDER BY e.requested_start_number, e.id`);
      const rows =
        (
          result as unknown as {
            rows: {
              id: string;
              requested_start_number: string | null;
              status_category: string | null;
            }[];
          }
        ).rows ?? [];
      return rows.map((row) => ({
        entryId: row.id,
        startNumber: row.requested_start_number ?? row.id,
        statusCategory: row.status_category,
      }));
    },
    record: async (ctx, eventId, input, actor) => {
      if (!timingUuid.test(eventId) || !timingUuid.test(input.entryId))
        return null;
      try {
        return await db.transaction((tx) =>
          insert(tx as unknown as Database, ctx, eventId, input, actor, null),
        );
      } catch (error) {
        if (isDuplicateTimingRun(error))
          throw new Error('Duplicate timing run');
        throw error;
      }
    },
    recordMany: async (ctx, eventId, inputs, actor) => {
      if (
        !timingUuid.test(eventId) ||
        inputs.some((input) => !timingUuid.test(input.entryId))
      )
        return [];
      try {
        return await db.transaction(async (transaction) => {
          const tx = transaction as unknown as Database;
          const results: TimingMeasurementRecord[] = [];
          for (const input of inputs) {
            const row = await insert(tx, ctx, eventId, input, actor, null);
            if (!row) throw new Error('Timing entry not found');
            results.push(row);
          }
          return results;
        });
      } catch (error) {
        if (isDuplicateTimingRun(error))
          throw new Error('Duplicate timing run');
        throw error;
      }
    },
    list: async (ctx, eventId) => {
      if (!timingUuid.test(eventId)) return [];
      const result = await db.execute(sql`SELECT * FROM timing_measurement
        WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} ORDER BY entry_id,run,version`);
      return ((result as unknown as { rows: TimingDbRow[] }).rows ?? []).map(
        mapTimingRow,
      );
    },
    createDraft: async (ctx, eventId, rule, results, actor) => {
      if (!timingUuid.test(eventId)) return null;
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        await tx.execute(
          sql`SELECT id FROM event WHERE organization_id=${ctx.organizationId} AND id=${eventId} FOR UPDATE`,
        );
        const result =
          await tx.execute(sql`INSERT INTO timing_result_version (organization_id,event_id,version,status,rule,results,actor)
          SELECT ${ctx.organizationId},${eventId},COALESCE(MAX(version),0)+1,'draft',${JSON.stringify(rule)}::jsonb,${JSON.stringify(results)}::jsonb,${actor}
          FROM timing_result_version WHERE organization_id=${ctx.organizationId} AND event_id=${eventId}
          RETURNING event_id,version,status,rule,results,actor,created_at,published_at`);
        const row = (result as unknown as { rows: TimingResultDbRow[] })
          .rows[0];
        if (!row) return null;
        await tx.execute(sql`INSERT INTO timing_audit (organization_id,event_id,result_version,action,actor,details)
          VALUES (${ctx.organizationId},${eventId},${row.version},'draft',${actor},'{}'::jsonb)`);
        return mapTimingResult(row);
      });
    },
    publish: async (ctx, eventId, version, actor) => {
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        const result =
          await tx.execute(sql`UPDATE timing_result_version SET status='published',published_at=now()
          WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} AND version=${version} AND status='draft'
          RETURNING event_id,version,status,rule,results,actor,created_at,published_at`);
        const row = (result as unknown as { rows: TimingResultDbRow[] })
          .rows[0];
        if (!row) return null;
        await tx.execute(sql`INSERT INTO timing_audit (organization_id,event_id,result_version,action,actor,details)
          VALUES (${ctx.organizationId},${eventId},${version},'publish',${actor},'{}'::jsonb)`);
        return mapTimingResult(row);
      });
    },
    latestPublished: async (ctx, eventId) => {
      if (!timingUuid.test(eventId)) return null;
      const result =
        await db.execute(sql`SELECT event_id,version,status,rule,results,actor,created_at,published_at FROM timing_result_version
        WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} AND status='published' ORDER BY version DESC LIMIT 1`);
      const row = (result as unknown as { rows: TimingResultDbRow[] }).rows[0];
      return row ? mapTimingResult(row) : null;
    },
    resolveEntry: async (ctx, eventId, lookup) => {
      if (!timingUuid.test(eventId)) return null;
      const result =
        await db.execute(sql`SELECT id, requested_start_number FROM entry WHERE organization_id=${ctx.organizationId}
        AND event_id=${eventId} AND deleted_at IS NULL AND (${lookup.entryId ? sql`id=${lookup.entryId}` : sql`requested_start_number=${lookup.startNumber ?? ''}`}) LIMIT 2`);
      const rows =
        (
          result as unknown as {
            rows: { id: string; requested_start_number: string | null }[];
          }
        ).rows ?? [];
      if (rows.length !== 1) return null;
      return {
        entryId: rows[0]!.id,
        startNumber: rows[0]!.requested_start_number ?? rows[0]!.id,
      };
    },
    correct: async (ctx, eventId, measurementId, input, actor) => {
      if (!timingUuid.test(eventId) || !timingUuid.test(measurementId))
        return null;
      try {
        return await db.transaction(async (transaction) => {
          const tx = transaction as unknown as Database;
          const found =
            await tx.execute(sql`SELECT * FROM timing_measurement WHERE organization_id=${ctx.organizationId}
            AND event_id=${eventId} AND id=${measurementId} AND active FOR UPDATE`);
          const old = (found as unknown as { rows: TimingDbRow[] }).rows[0];
          if (!old) return null;
          await tx.execute(sql`UPDATE timing_measurement SET active=false WHERE organization_id=${ctx.organizationId}
            AND event_id=${eventId} AND id=${measurementId}`);
          const next = await insert(
            tx,
            ctx,
            eventId,
            {
              entryId: input.entryId ?? old.entry_id,
              run: input.run ?? old.run,
              timeMs: input.timeMs ?? old.time_ms,
              penaltyMs: input.penaltyMs ?? old.penalty_ms,
              ...('exclusion' in input
                ? input.exclusion
                  ? { exclusion: input.exclusion }
                  : {}
                : old.exclusion
                  ? { exclusion: old.exclusion }
                  : {}),
              source: input.source ?? old.source,
              recordedAt: input.recordedAt ?? new Date().toISOString(),
            },
            actor,
            old.id,
          );
          if (!next) throw new Error('Timing correction target not found');
          return next;
        });
      } catch (error) {
        if (isDuplicateTimingRun(error))
          throw new Error('Duplicate timing run');
        throw error;
      }
    },
  };
}
