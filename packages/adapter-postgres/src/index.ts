import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, and } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  boolean,
  date,
  timestamp,
  unique,
  check,
  index,
  integer,
  foreignKey,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
} from '@racepilot/core';
import {
  organizationId,
  permissionsForRole,
  normalizeEmail,
  normalizeRequestedStartNumber,
  deriveInvoiceStatus,
  createPaymentReference,
} from '@racepilot/core';
import type { Pool } from 'pg';
export const organizations = pgTable(
  'organization',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    contactEmail: text('contact_email'),
    websiteUrl: text('website_url'),
    timezone: text('timezone').notNull(),
    locale: text('locale').notNull(),
    currency: text('currency').notNull().default('EUR'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'organization_status_check',
      sql`${t.status} in ('active','disabled')`,
    ),
  ],
);
export const events = pgTable(
  'event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    status: text('status').notNull().default('draft'),
    registrationOpensAt: timestamp('registration_opens_at', {
      withTimezone: true,
    }),
    registrationClosesAt: timestamp('registration_closes_at', {
      withTimezone: true,
    }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('event_organization_slug_unique').on(t.organizationId, t.slug),
    unique('event_organization_id_unique').on(t.organizationId, t.id),
    check(
      'event_status_check',
      sql`${t.status} in ('draft','open','closed','archived')`,
    ),
    check('event_dates_check', sql`${t.endsOn} >= ${t.startsOn}`),
  ],
);
export const eventClasses = pgTable(
  'event_class',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    vehicleType: text('vehicle_type').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    maxParticipants: integer('max_participants'),
    closed: boolean('closed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('event_class_org_event_id_unique').on(
      t.organizationId,
      t.eventId,
      t.id,
    ),
    unique('event_class_org_event_code_unique').on(
      t.organizationId,
      t.eventId,
      t.code,
    ),
    check(
      'event_class_vehicle_type_check',
      sql`${t.vehicleType} in ('car','motorcycle','kart','other')`,
    ),
    check('event_class_sort_order_check', sql`${t.sortOrder} >= 0`),
    check(
      'event_class_max_participants_check',
      sql`${t.maxParticipants} is null or ${t.maxParticipants} > 0`,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_class_org_event_fk',
    }).onDelete('cascade'),
  ],
);
export const userIdentities = pgTable(
  'user_identity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    email: text('email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('user_identity_issuer_subject_unique').on(t.issuer, t.subject),
  ],
);
export const organizationMemberships = pgTable(
  'organization_membership',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userIdentityId: uuid('user_identity_id')
      .notNull()
      .references(() => userIdentities.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('organization_membership_org_identity_unique').on(
      t.organizationId,
      t.userIdentityId,
    ),
    check(
      'organization_membership_role_check',
      sql`${t.role} in ('admin','member')`,
    ),
    check(
      'organization_membership_status_check',
      sql`${t.status} in ('active','disabled')`,
    ),
    index('organization_membership_identity_idx').on(t.userIdentityId),
  ],
);
export const people = pgTable(
  'person',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    emailNormalized: text('email_normalized'),
    dateOfBirth: date('date_of_birth'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletionReason: text('deletion_reason'),
  },
  (t) => [
    unique('person_org_id_unique').on(t.organizationId, t.id),
    // Soft-deleted people release their email for a new person record.
    uniqueIndex('person_org_email_unique')
      .on(t.organizationId, t.emailNormalized)
      .where(sql`${t.deletedAt} is null`),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
      name: 'person_org_fk',
    }).onDelete('cascade'),
    check(
      'person_deleted_reason_check',
      sql`${t.deletedAt} is null or ${t.deletionReason} is not null`,
    ),
  ],
);
export const vehicles = pgTable(
  'vehicle',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    make: text('make').notNull(),
    model: text('model').notNull(),
    year: integer('year'),
    registration: text('registration'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletionReason: text('deletion_reason'),
  },
  (t) => [
    unique('vehicle_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
      name: 'vehicle_org_fk',
    }).onDelete('cascade'),
    check(
      'vehicle_deleted_reason_check',
      sql`${t.deletedAt} is null or ${t.deletionReason} is not null`,
    ),
  ],
);
export const registrationGroups = pgTable(
  'registration_group',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    personId: uuid('person_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('registration_group_org_id_unique').on(t.organizationId, t.id),
    unique('registration_group_org_event_id_unique').on(
      t.organizationId,
      t.eventId,
      t.id,
    ),
    unique('registration_group_org_event_person_unique').on(
      t.organizationId,
      t.eventId,
      t.id,
      t.personId,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'registration_group_org_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
      name: 'registration_group_org_person_fk',
    }),
  ],
);
export const entries = pgTable(
  'entry',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    classId: uuid('class_id').notNull(),
    registrationGroupId: uuid('registration_group_id').notNull(),
    driverPersonId: uuid('driver_person_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    verificationStatus: text('verification_status')
      .notNull()
      .default('unverified'),
    acceptanceStatus: text('acceptance_status').notNull().default('pending'),
    requestedStartNumber: text('requested_start_number'),
    priceSnapshotVersion: text('price_snapshot_version'),
    priceSnapshot: jsonb('price_snapshot').$type<
      import('@racepilot/core').PriceSnapshot | null
    >(),
    formSnapshotVersion: text('form_snapshot_version'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletionReason: text('deletion_reason'),
  },
  (t) => [
    unique('entry_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'entry_org_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.classId],
      foreignColumns: [
        eventClasses.organizationId,
        eventClasses.eventId,
        eventClasses.id,
      ],
      name: 'entry_org_class_fk',
    }),
    foreignKey({
      columns: [
        t.organizationId,
        t.eventId,
        t.registrationGroupId,
        t.driverPersonId,
      ],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
        registrationGroups.personId,
      ],
      name: 'entry_org_group_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.driverPersonId],
      foreignColumns: [people.organizationId, people.id],
      name: 'entry_org_driver_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.vehicleId],
      foreignColumns: [vehicles.organizationId, vehicles.id],
      name: 'entry_org_vehicle_fk',
    }),
    check(
      'entry_verification_status_check',
      sql`${t.verificationStatus} in ('unverified','verified')`,
    ),
    check(
      'entry_acceptance_status_check',
      sql`${t.acceptanceStatus} in ('pending','accepted','rejected','waitlisted','withdrawn')`,
    ),
    check(
      'entry_deleted_reason_check',
      sql`${t.deletedAt} is null or ${t.deletionReason} is not null`,
    ),
    uniqueIndex('entry_event_requested_start_number_unique')
      .on(t.organizationId, t.eventId, t.requestedStartNumber)
      .where(
        sql`${t.requestedStartNumber} is not null and ${t.deletedAt} is null and ${t.acceptanceStatus} <> 'withdrawn'`,
      ),
  ],
);
export const entryAuditEvents = pgTable(
  'entry_audit_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    transition: text('transition').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.entryId],
      foreignColumns: [entries.organizationId, entries.id],
      name: 'entry_audit_org_entry_fk',
    }).onDelete('cascade'),
    check(
      'entry_audit_transition_check',
      sql`${t.transition} in ('verification','acceptance')`,
    ),
    check('entry_audit_actor_check', sql`length(trim(${t.actor})) > 0`),
    check('entry_audit_reason_check', sql`length(trim(${t.reason})) > 0`),
    index('entry_audit_entry_idx').on(
      t.organizationId,
      t.entryId,
      t.occurredAt,
    ),
  ],
);

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
      sql`${t.templateKey} in ('verification','entry-received','accepted','rejected')`,
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
      sql`${t.templateKey} in ('verification','entry-received','accepted','rejected')`,
    ),
    check('email_outbox_locale_check', sql`${t.locale} in ('de','en')`),
    check(
      'email_outbox_status_check',
      sql`${t.status} in ('pending','sending','sent','failed')`,
    ),
    index('email_outbox_due_idx')
      .on(t.availableAt)
      .where(sql`${t.status} in ('pending','sending')`),
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

export type Database = ReturnType<typeof drizzle>;
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
  };
}
export const eventClassPricingRules = pgTable(
  'event_class_pricing_rule',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    classId: uuid('class_id').notNull(),
    baseCents: integer('base_cents').notNull(),
    additionalEntryAdjustmentCents: integer('additional_entry_adjustment_cents')
      .notNull()
      .default(0),
    earlyBirdDeadline: timestamp('early_bird_deadline', { withTimezone: true }),
    earlyBirdDiscountCents: integer('early_bird_discount_cents')
      .notNull()
      .default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('event_class_price_org_event_class_unique').on(
      t.organizationId,
      t.eventId,
      t.classId,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.classId],
      foreignColumns: [
        eventClasses.organizationId,
        eventClasses.eventId,
        eventClasses.id,
      ],
      name: 'event_class_price_class_fk',
    }).onDelete('cascade'),
    check(
      'event_class_price_nonnegative_check',
      sql`${t.baseCents} >= 0 and ${t.earlyBirdDiscountCents} >= 0`,
    ),
  ],
);
export const organizationPaymentRecipients = pgTable(
  'organization_payment_recipient',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accountName: text('account_name').notNull(),
    iban: text('iban').notNull(),
    bic: text('bic'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
export const invoiceReferenceCounters = pgTable('invoice_reference_counter', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  nextValue: integer('next_value').notNull(),
});
export const invoices = pgTable(
  'invoice',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    registrationGroupId: uuid('registration_group_id').notNull(),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull(),
    paymentReference: text('payment_reference').notNull(),
    status: text('status').notNull().default('open'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('invoice_org_group_unique').on(
      t.organizationId,
      t.registrationGroupId,
    ),
    unique('invoice_org_reference_unique').on(
      t.organizationId,
      t.paymentReference,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'invoice_org_group_fk',
    }).onDelete('cascade'),
    check('invoice_amount_check', sql`${t.totalCents} >= 0`),
    check(
      'invoice_status_check',
      sql`${t.status} in ('open','partially_paid','paid','cancelled')`,
    ),
  ],
);
export const invoicePayments = pgTable(
  'invoice_payment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    reversesPaymentId: uuid('reverses_payment_id'),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
      name: 'invoice_payment_invoice_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.reversesPaymentId],
      foreignColumns: [t.organizationId, t.id],
      name: 'invoice_payment_reversal_fk',
    }),
    check('invoice_payment_amount_nonzero_check', sql`${t.amountCents} <> 0`),
    check('invoice_payment_actor_check', sql`length(trim(${t.actor})) > 0`),
    check('invoice_payment_reason_check', sql`length(trim(${t.reason})) > 0`),
  ],
);
export const invoicePaymentAuditEvents = pgTable(
  'invoice_payment_audit_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    paymentId: uuid('payment_id').notNull(),
    action: text('action').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.paymentId],
      foreignColumns: [invoicePayments.organizationId, invoicePayments.id],
      name: 'invoice_payment_audit_payment_fk',
    }).onDelete('cascade'),
  ],
);

export type Database = ReturnType<typeof drizzle>;
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
    ...row,
    organizationId: organizationId(row.organizationId),
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
    ...row,
    organizationId: organizationId(row.organizationId),
    verificationStatus:
      row.verificationStatus as import('@racepilot/core').Entry['verificationStatus'],
    acceptanceStatus:
      row.acceptanceStatus as import('@racepilot/core').Entry['acceptanceStatus'],
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
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
      return row ? mapEntry(row) : null;
    },
    transition: async (
      ctx,
      id,
      transition,
      fromStatus,
      toStatus,
      actor,
      reason,
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
        });
        return mapEntry(row);
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
export type MailOutboxExecutor = Pick<Database, 'execute'>;
export interface NewMailOutboxMessage {
  eventId?: string | null;
  templateKey: string;
  templateVersion: number;
  templateVersionId?: string | null;
  locale: 'de' | 'en';
  recipient: string;
  idempotencyKey: string;
  variables: Record<string, string>;
}
/** Call with the caller's Drizzle transaction to atomically enqueue with domain writes. */
export async function enqueueMailOutbox(
  executor: MailOutboxExecutor,
  organization: string,
  input: NewMailOutboxMessage,
): Promise<string> {
  const result = await executor.execute(sql`insert into email_outbox
    (organization_id,event_id,template_key,template_version,template_version_id,locale,recipient,idempotency_key,variables)
    values (${organization},${input.eventId ?? null},${input.templateKey},${input.templateVersion},${input.templateVersionId ?? null},${input.locale},${input.recipient},${input.idempotencyKey},${JSON.stringify(input.variables)}::jsonb)
    on conflict (organization_id,idempotency_key) do nothing returning id`);
  const rows = (result as unknown as { rows: Array<{ id: string }> }).rows;
  if (rows[0]) return rows[0].id;
  const existing = await executor.execute(
    sql`select id from email_outbox where organization_id=${organization} and idempotency_key=${input.idempotencyKey}`,
  );
  const existingRows = (existing as unknown as { rows: Array<{ id: string }> })
    .rows;
  if (!existingRows[0]) throw new Error('Mail outbox enqueue failed');
  return existingRows[0].id;
}

export function createMailOutboxRepository(db: Database) {
  return {
    get: async (ctx: { organizationId: string }, id: string) => {
      const result = await db.execute(
        sql`select id,organization_id as "organizationId",event_id as "eventId",template_key as "templateKey",template_version as "templateVersion",locale,recipient,idempotency_key as "idempotencyKey",variables,status,attempts from email_outbox where organization_id=${ctx.organizationId} and id=${id}`,
      );
      return (
        (result as unknown as { rows: Array<Record<string, unknown>> })
          .rows[0] ?? null
      );
    },
    claim: async (ctx: { organizationId: string }, id: string) => {
      const result = await db.execute(
        sql`update email_outbox set status='sending',claimed_at=now() where organization_id=${ctx.organizationId} and id=${id} and status='pending' and available_at<=now() returning id,organization_id as "organizationId",event_id as "eventId",template_key as "templateKey",template_version as "templateVersion",locale,recipient,idempotency_key as "idempotencyKey",variables,status,attempts`,
      );
      return (
        (result as unknown as { rows: Array<Record<string, unknown>> })
          .rows[0] ?? null
      );
    },
    template: async (
      ctx: { organizationId: string },
      key: string,
      version: number,
      locale: string,
    ) => {
      const result = await db.execute(
        sql`select subject,text_body as text,html_body as html from email_template_version where organization_id=${ctx.organizationId} and template_key=${key} and version=${version} and locale=${locale}`,
      );
      return (
        (
          result as unknown as {
            rows: Array<{ subject: string; text: string; html: string }>;
          }
        ).rows[0] ?? null
      );
    },
    organizationMailConfig: async (ctx: { organizationId: string }) => {
      const result = await db.execute(
        sql`select mail_from as "from",mail_reply_to as "replyTo" from organization where id=${ctx.organizationId} and status='active'`,
      );
      return (
        (
          result as unknown as {
            rows: Array<{ from: string | null; replyTo: string | null }>;
          }
        ).rows[0] ?? null
      );
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
        await tx.execute(
          sql`update email_outbox set status=${outcome.outcome === 'retry' ? 'pending' : outcome.outcome},attempts=${outcome.attempts},available_at=${outcome.availableAt ?? new Date()},sent_at=${outcome.outcome === 'sent' ? new Date() : null},claimed_at=null,last_error=${outcome.error ?? null} where organization_id=${ctx.organizationId} and id=${id} and status='sending'`,
        );
        await tx.execute(
          sql`insert into email_delivery(organization_id,outbox_id,attempt,outcome,error) values (${ctx.organizationId},${id},${outcome.attempts},${outcome.outcome},${outcome.error ?? null}) on conflict (organization_id,outbox_id,attempt) do nothing`,
        );
      });
    },
  };
}
