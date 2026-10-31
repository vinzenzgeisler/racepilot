import { drizzle } from 'drizzle-orm/node-postgres';
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
  primaryKey,
  uuid,
  text,
  boolean,
  date,
  timestamp,
  unique,
  check,
  index,
  integer,
  doublePrecision,
  foreignKey,
  uniqueIndex,
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
  ArtifactJobRepository,
  ArtifactJob,
  ArtifactKind,
  ModuleActivationRepository,
  ModuleStateRecord,
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
export const organizations = pgTable(
  'organization',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    contactEmail: text('contact_email'),
    mailFrom: text('mail_from'),
    mailReplyTo: text('mail_reply_to'),
    websiteUrl: text('website_url'),
    timezone: text('timezone').notNull(),
    locale: text('locale').notNull(),
    currency: text('currency').notNull().default('EUR'),
    registrationSettings: jsonb('registration_settings')
      .$type<{
        sharedContactEmail: 'allowed' | 'disallowed';
        minimumAge: number | null;
        guardianRequiredBelowAge: number;
        maximumClassesPerGroup: number;
      }>()
      .notNull()
      .default({
        sharedContactEmail: 'allowed',
        minimumAge: null,
        guardianRequiredBelowAge: 18,
        maximumClassesPerGroup: 8,
      }),
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
    check(
      'organization_mail_from_check',
      sql`${t.mailFrom} is null or (length(trim(${t.mailFrom})) > 3 and position('@' in ${t.mailFrom}) > 1)`,
    ),
    check(
      'organization_mail_reply_to_check',
      sql`${t.mailReplyTo} is null or (length(trim(${t.mailReplyTo})) > 3 and position('@' in ${t.mailReplyTo}) > 1)`,
    ),
    check(
      'organization_registration_settings_check',
      sql`jsonb_typeof(${t.registrationSettings}) = 'object' and ${t.registrationSettings} ?& array['sharedContactEmail','minimumAge','guardianRequiredBelowAge','maximumClassesPerGroup'] and (${t.registrationSettings} - 'sharedContactEmail' - 'minimumAge' - 'guardianRequiredBelowAge' - 'maximumClassesPerGroup') = '{}'::jsonb and ${t.registrationSettings}->>'sharedContactEmail' in ('allowed','disallowed') and (${t.registrationSettings}->>'guardianRequiredBelowAge')::int between 0 and 100 and (${t.registrationSettings}->>'maximumClassesPerGroup')::int between 1 and 100 and (jsonb_typeof(${t.registrationSettings}->'minimumAge') = 'null' or (${t.registrationSettings}->>'minimumAge')::int between 0 and 100)`,
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
    consentTerms: jsonb('consent_terms')
      .$type<
        Array<{
          key: string;
          version: string;
          language: 'de' | 'en';
          text: string;
          hash: string;
        }>
      >()
      .notNull()
      .default([]),
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
    country: text('country'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletionReason: text('deletion_reason'),
  },
  (t) => [
    unique('person_org_id_unique').on(t.organizationId, t.id),
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
    contactEmail: text('contact_email'),
    guardianName: text('guardian_name'),
    guardianEmail: text('guardian_email'),
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
    statusHints: jsonb('status_hints')
      .$type<Record<'double_starter' | 'passenger' | 'late_entry', boolean>>()
      .notNull()
      .default({ double_starter: false, passenger: false, late_entry: false }),
    workflowRevisionId: uuid('workflow_revision_id'),
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
    unique('entry_org_event_id_unique').on(t.organizationId, t.eventId, t.id),
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
    statusCategory: text('status_category'),
    workflowRevisionId: uuid('workflow_revision_id').notNull(),
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
export const eventEntryStatusDimensionConfigs = pgTable(
  'event_entry_status_dimension_config',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    config: jsonb('config')
      .$type<import('@racepilot/core').EntryStatusDimensionConfig>()
      .notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_entry_status_dimension_config_event_fk',
    }).onDelete('cascade'),
  ],
);
export const entryStatusDimensionValues = pgTable(
  'entry_status_dimension_value',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    dimension: text('dimension').notNull(),
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.entryId, t.dimension] }),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.entryId],
      foreignColumns: [entries.organizationId, entries.eventId, entries.id],
      name: 'entry_status_dimension_value_entry_fk',
    }).onDelete('cascade'),
    check(
      'entry_status_dimension_value_dimension_check',
      sql`${t.dimension} in ('technical_inspection','waiver')`,
    ),
    check(
      'entry_status_dimension_value_key_check',
      sql`length(trim(${t.value})) > 0`,
    ),
  ],
);
export const entryStatusDimensionAudit = pgTable(
  'entry_status_dimension_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    dimension: text('dimension').notNull(),
    fromValue: text('from_value').notNull(),
    toValue: text('to_value').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId, t.entryId],
      foreignColumns: [entries.organizationId, entries.eventId, entries.id],
      name: 'entry_status_dimension_audit_entry_fk',
    }).onDelete('cascade'),
    check(
      'entry_status_dimension_audit_dimension_check',
      sql`${t.dimension} in ('technical_inspection','waiver')`,
    ),
    check(
      'entry_status_dimension_audit_actor_check',
      sql`length(trim(${t.actor})) > 0`,
    ),
    check(
      'entry_status_dimension_audit_reason_check',
      sql`length(trim(${t.reason})) > 0`,
    ),
    index('entry_status_dimension_audit_entry_idx').on(
      t.organizationId,
      t.entryId,
      t.occurredAt,
    ),
  ],
);
export const eventEntryStatusDimensionConfigAudit = pgTable(
  'event_entry_status_dimension_config_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    beforeConfig: jsonb('before_config').$type<
      import('@racepilot/core').EntryStatusDimensionConfig | null
    >(),
    afterConfig: jsonb('after_config')
      .$type<import('@racepilot/core').EntryStatusDimensionConfig>()
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_entry_status_dimension_config_audit_event_fk',
    }).onDelete('cascade'),
    check(
      'event_entry_status_dimension_config_audit_actor_check',
      sql`length(trim(${t.actor})) > 0`,
    ),
    check(
      'event_entry_status_dimension_config_audit_reason_check',
      sql`length(trim(${t.reason})) > 0`,
    ),
  ],
);
export const entryStatusHintsAudit = pgTable(
  'entry_status_hints_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    beforeHints: jsonb('before_hints')
      .$type<Record<string, boolean>>()
      .notNull(),
    afterHints: jsonb('after_hints').$type<Record<string, boolean>>().notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId, t.entryId],
      foreignColumns: [entries.organizationId, entries.eventId, entries.id],
      name: 'entry_status_hints_audit_entry_fk',
    }).onDelete('cascade'),
    check(
      'entry_status_hints_audit_actor_check',
      sql`length(trim(${t.actor})) > 0`,
    ),
    check(
      'entry_status_hints_audit_reason_check',
      sql`length(trim(${t.reason})) > 0`,
    ),
  ],
);

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

export const publicEntrySubmissions = pgTable(
  'public_entry_submission',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    submissionId: uuid('submission_id').notNull(),
    requestFingerprint: text('request_fingerprint'),
    registrationGroupId: uuid('registration_group_id'),
    response: jsonb('response').$type<{
      accepted: true;
      entryCount: number;
    } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId, t.submissionId] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'public_entry_submission_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'public_entry_submission_group_fk',
    }),
  ],
);
export const publicRegistrationRateLimits = pgTable(
  'public_registration_rate_limit',
  {
    scopeHash: text('scope_hash').notNull(),
    clientHash: text('client_hash').notNull(),
    remainingTokens: doublePrecision('remaining_tokens').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.scopeHash, t.clientHash] }),
    check(
      'public_registration_rate_limit_tokens_check',
      sql`${t.remainingTokens} >= 0`,
    ),
    index('public_registration_rate_limit_updated_at_idx').on(t.updatedAt),
  ],
);
export const organizationPublicRegistrationRateLimitOverrides = pgTable(
  'organization_public_registration_rate_limit_override',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    organizationLimit: integer('organization_limit'),
    eventLimit: integer('event_limit'),
    windowSeconds: integer('window_seconds'),
  },
  (t) => [
    check(
      'organization_public_registration_rate_limit_override_org_check',
      sql`${t.organizationLimit} is null or ${t.organizationLimit} between 1 and 100000`,
    ),
    check(
      'organization_public_registration_rate_limit_override_event_check',
      sql`${t.eventLimit} is null or ${t.eventLimit} between 1 and 100000`,
    ),
    check(
      'organization_public_registration_rate_limit_override_window_check',
      sql`${t.windowSeconds} is null or ${t.windowSeconds} between 1 and 86400`,
    ),
    check(
      'organization_public_registration_rate_limit_override_nonempty_check',
      sql`${t.organizationLimit} is not null or ${t.eventLimit} is not null or ${t.windowSeconds} is not null`,
    ),
  ],
);
export const eventPublicRegistrationRateLimitOverrides = pgTable(
  'event_public_registration_rate_limit_override',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    eventLimit: integer('event_limit'),
    windowSeconds: integer('window_seconds'),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_public_registration_rate_limit_override_event_fk',
    }).onDelete('cascade'),
    check(
      'event_public_registration_rate_limit_override_limit_check',
      sql`${t.eventLimit} is null or ${t.eventLimit} between 1 and 100000`,
    ),
    check(
      'event_public_registration_rate_limit_override_window_check',
      sql`${t.windowSeconds} is null or ${t.windowSeconds} between 1 and 86400`,
    ),
    check(
      'event_public_registration_rate_limit_override_nonempty_check',
      sql`${t.eventLimit} is not null or ${t.windowSeconds} is not null`,
    ),
  ],
);
export const publicRegistrationRateLimitOverrideAudit = pgTable(
  'public_registration_rate_limit_override_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id'),
    scope: text('scope').notNull(),
    actor: text('actor').notNull(),
    beforeSettings: jsonb('before_settings'),
    afterSettings: jsonb('after_settings'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'public_registration_rate_limit_override_audit_event_fk',
    }).onDelete('cascade'),
    check(
      'public_registration_rate_limit_override_audit_scope_check',
      sql`${t.scope} in ('organization', 'event')`,
    ),
    check(
      'public_registration_rate_limit_override_audit_target_check',
      sql`(${t.scope} = 'organization' and ${t.eventId} is null) or (${t.scope} = 'event' and ${t.eventId} is not null)`,
    ),
    index('public_registration_rate_limit_override_audit_org_idx').on(
      t.organizationId,
      t.occurredAt,
    ),
  ],
);
export const groupEmailVerifications = pgTable(
  'registration_group_email_verification',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    registrationGroupId: uuid('registration_group_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'group_email_verification_group_fk',
    }).onDelete('cascade'),
    index('group_email_verification_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.consumedAt} is null`),
  ],
);
export const consentEvidence = pgTable(
  'consent_evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    registrationGroupId: uuid('registration_group_id').notNull(),
    textKey: text('text_key').notNull(),
    textVersion: text('text_version').notNull(),
    language: text('language').notNull(),
    textHash: text('text_hash').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'consent_evidence_group_fk',
    }).onDelete('cascade'),
    index('consent_evidence_group_idx').on(
      t.organizationId,
      t.registrationGroupId,
    ),
  ],
);
export const eventConsentTermsAudit = pgTable(
  'event_consent_terms_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    actor: text('actor').notNull(),
    beforeTerms: jsonb('before_terms').notNull(),
    afterTerms: jsonb('after_terms').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_consent_terms_audit_event_fk',
    }).onDelete('cascade'),
  ],
);
export const registrationSettingsAudit = pgTable(
  'registration_settings_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actor: text('actor').notNull(),
    beforeSettings: jsonb('before_settings').notNull(),
    afterSettings: jsonb('after_settings').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const organizationModules = pgTable(
  'organization_module',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    moduleId: text('module_id').notNull(),
    enabled: boolean('enabled').notNull(),
    config: jsonb('config').$type<unknown>().notNull(),
    version: integer('version').notNull(),
    moduleVersion: text('module_version').notNull(),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.moduleId] })],
);
export const eventModules = pgTable(
  'event_module',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    moduleId: text('module_id').notNull(),
    enabled: boolean('enabled').notNull(),
    config: jsonb('config').$type<unknown>().notNull(),
    version: integer('version').notNull(),
    moduleVersion: text('module_version').notNull(),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId, t.moduleId] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_module_event_fk',
    }).onDelete('cascade'),
  ],
);
export const moduleActivationAudit = pgTable('module_activation_audit', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id'),
  moduleId: text('module_id').notNull(),
  action: text('action').notNull(),
  actor: text('actor').notNull(),
  reason: text('reason'),
  version: integer('version').notNull(),
  beforeState: jsonb('before_state').$type<unknown>(),
  afterState: jsonb('after_state').$type<unknown>().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
const toModuleRecord = (row: {
  moduleId: string;
  enabled: boolean;
  config: unknown;
  version: number;
  moduleVersion: string;
  updatedBy: string;
  updatedAt: Date;
}): ModuleStateRecord => ({
  moduleId: row.moduleId,
  enabled: row.enabled,
  config: row.config,
  version: row.version,
  moduleVersion: row.moduleVersion,
  updatedAt: row.updatedAt,
  updatedBy: row.updatedBy,
});
export function createModuleActivationRepository(
  db: Database,
): ModuleActivationRepository {
  const orgRows = async (tx: Database, ctx: RequestContext) =>
    (
      await tx
        .select()
        .from(organizationModules)
        .where(eq(organizationModules.organizationId, ctx.organizationId))
    ).map(toModuleRecord);
  const eventRows = async (
    tx: Database,
    ctx: RequestContext,
    eventId: string,
  ) =>
    (
      await tx
        .select()
        .from(eventModules)
        .where(
          and(
            eq(eventModules.organizationId, ctx.organizationId),
            eq(eventModules.eventId, eventId),
          ),
        )
    ).map(toModuleRecord);
  const ownsEvent = async (
    tx: Database,
    ctx: RequestContext,
    eventId: string,
  ) =>
    (
      await tx
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
    ).length === 1;
  const snapshotOf = (r: ModuleStateRecord) => ({
    enabled: r.enabled,
    config: r.config,
    version: r.version,
    moduleVersion: r.moduleVersion,
  });
  return {
    listOrganization: (ctx) => orgRows(db, ctx),
    listEvent: async (ctx, eventId) => {
      if (!uuidPattern.test(eventId)) return null;
      return db.transaction(async (tx) => {
        const database = tx as unknown as Database;
        if (!(await ownsEvent(database, ctx, eventId))) return null;
        return {
          organization: await orgRows(database, ctx),
          event: await eventRows(database, ctx, eventId),
        };
      });
    },
    apply: async (ctx, scope, moduleId, decide) => {
      if (scope.level === 'event' && !uuidPattern.test(scope.eventId))
        return null;
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        // Organization row serializes org-level writers; events share it so an
        // event activation cannot race an organization-level disable.
        const lockOrg = tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId));
        await (scope.level === 'organization'
          ? lockOrg.for('update')
          : lockOrg.for('share'));
        if (scope.level === 'event') {
          const locked = await tx
            .select({ id: events.id })
            .from(events)
            .where(
              and(
                eq(events.organizationId, ctx.organizationId),
                eq(events.id, scope.eventId),
              ),
            )
            .for('update');
          if (locked.length !== 1) return null;
        }
        const organization = await orgRows(tx, ctx);
        const event =
          scope.level === 'event'
            ? await eventRows(tx, ctx, scope.eventId)
            : undefined;
        const before = (event ?? organization).find(
          (row) => row.moduleId === moduleId,
        );
        const write = decide({
          organization: new Map(organization.map((r) => [r.moduleId, r])),
          ...(event
            ? { event: new Map(event.map((r) => [r.moduleId, r])) }
            : {}),
        });
        if (!write) return null;
        const values = {
          organizationId: ctx.organizationId,
          moduleId,
          enabled: write.enabled,
          config: write.config,
          version: (before?.version ?? 0) + 1,
          moduleVersion: write.moduleVersion,
          updatedBy: write.actor,
          updatedAt: new Date(),
        };
        const [saved] =
          scope.level === 'event'
            ? await tx
                .insert(eventModules)
                .values({ ...values, eventId: scope.eventId })
                .onConflictDoUpdate({
                  target: [
                    eventModules.organizationId,
                    eventModules.eventId,
                    eventModules.moduleId,
                  ],
                  set: values,
                })
                .returning()
            : await tx
                .insert(organizationModules)
                .values(values)
                .onConflictDoUpdate({
                  target: [
                    organizationModules.organizationId,
                    organizationModules.moduleId,
                  ],
                  set: values,
                })
                .returning();
        const record = toModuleRecord(saved!);
        await tx.insert(moduleActivationAudit).values({
          organizationId: ctx.organizationId,
          eventId: scope.level === 'event' ? scope.eventId : null,
          moduleId,
          action: write.action,
          actor: write.actor,
          reason: write.reason ?? null,
          version: record.version,
          beforeState: before ? snapshotOf(before) : null,
          afterState: snapshotOf(record),
        });
        return record;
      });
    },
  };
}
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
export const artifactJobs = pgTable(
  'artifact_job',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    kind: text('kind').$type<ArtifactKind>().notNull(),
    registrationGroupId: uuid('registration_group_id'),
    fields: jsonb('fields').$type<string[]>().notNull().default([]),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status')
      .$type<ArtifactJob['status']>()
      .notNull()
      .default('queued'),
    objectId: uuid('object_id'),
    sha256: text('sha256'),
    contentType: text('content_type'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimToken: uuid('claim_token'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('artifact_job_org_id_unique').on(t.organizationId, t.id),
    unique('artifact_job_org_idempotency_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'artifact_job_org_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'artifact_job_group_fk',
    }).onDelete('cascade'),
    index('artifact_job_org_status_idx').on(
      t.organizationId,
      t.status,
      t.createdAt,
    ),
  ],
);

function toArtifactJob(row: typeof artifactJobs.$inferSelect): ArtifactJob {
  return {
    ...row,
    organizationId: organizationId(row.organizationId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createArtifactJobRepository(
  db: Database,
): ArtifactJobRepository {
  return {
    enqueue: async (ctx, input) => {
      const result = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(artifactJobs)
          .values({
            organizationId: ctx.organizationId,
            eventId: input.eventId,
            kind: input.kind,
            registrationGroupId: input.registrationGroupId ?? null,
            fields: [...(input.fields ?? [])],
            idempotencyKey: input.idempotencyKey,
          })
          .onConflictDoNothing({
            target: [artifactJobs.organizationId, artifactJobs.idempotencyKey],
          })
          .returning();
        if (inserted) {
          const envelope = {
            type: 'artifact.generate',
            schemaVersion: 1,
            organizationId: ctx.organizationId,
            correlationId: input.idempotencyKey,
            payload: { artifactJobId: inserted.id },
          };
          await tx.execute(
            sql`select graphile_worker.add_job('artifact_generate', ${JSON.stringify(envelope)}::json, null, now(), 25, ${`artifact:${inserted.id}`})`,
          );
          return inserted;
        }
        const [existing] = await tx
          .select()
          .from(artifactJobs)
          .where(
            and(
              eq(artifactJobs.organizationId, ctx.organizationId),
              eq(artifactJobs.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (
          !existing ||
          existing.eventId !== input.eventId ||
          existing.kind !== input.kind ||
          existing.registrationGroupId !==
            (input.registrationGroupId ?? null) ||
          JSON.stringify(existing.fields) !==
            JSON.stringify([...(input.fields ?? [])])
        )
          throw new Error('Artifact idempotency key conflict');
        return existing;
      });
      return toArtifactJob(result);
    },
    getById: async (ctx, id) => {
      const [row] = await db
        .select()
        .from(artifactJobs)
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
          ),
        )
        .limit(1);
      return row ? toArtifactJob(row) : null;
    },
    claim: async (ctx, id) => {
      const claimToken = randomUUID();
      const [row] = await db
        .update(artifactJobs)
        .set({
          status: 'processing',
          attempts: sql`${artifactJobs.attempts} + 1`,
          error: null,
          claimedAt: new Date(),
          claimToken,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
            or(
              eq(artifactJobs.status, 'queued'),
              and(
                eq(artifactJobs.status, 'processing'),
                lt(artifactJobs.claimedAt, sql`now() - interval '5 minutes'`),
              ),
            ),
          ),
        )
        .returning();
      return row ? { ...toArtifactJob(row), claimToken } : null;
    },
    release: async (ctx, id, claimToken) => {
      await db
        .update(artifactJobs)
        .set({
          status: 'queued',
          claimedAt: null,
          claimToken: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
            eq(artifactJobs.status, 'processing'),
            eq(artifactJobs.claimToken, claimToken),
          ),
        );
    },
    complete: async (ctx, id, claimToken, ref) => {
      if (ref.organizationId !== ctx.organizationId)
        throw new Error('Artifact owner mismatch');
      await db
        .update(artifactJobs)
        .set({
          status: 'ready',
          claimedAt: null,
          claimToken: null,
          objectId: ref.objectId,
          sha256: ref.sha256,
          contentType: ref.contentType,
          error: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
            eq(artifactJobs.status, 'processing'),
            eq(artifactJobs.claimToken, claimToken),
          ),
        );
    },
    fail: async (ctx, id, claimToken, error) => {
      await db
        .update(artifactJobs)
        .set({
          status: 'failed',
          claimedAt: null,
          claimToken: null,
          error: error.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactJobs.organizationId, ctx.organizationId),
            eq(artifactJobs.id, id),
            eq(artifactJobs.status, 'processing'),
            eq(artifactJobs.claimToken, claimToken),
          ),
        );
    },
  };
}

export type Database = ReturnType<typeof drizzle>;
export function createPostgresRegistrationRateLimiter(
  db: Database,
  options: { now?: () => number; cleanupEvery?: number } = {},
) {
  const now = options.now ?? Date.now;
  const cleanupEvery = options.cleanupEvery ?? 256;
  let calls = 0;
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  return {
    persistence: 'shared' as const,
    consume: async (
      clientIdentity: string,
      scopes: readonly { key: string; limit: number; windowMs: number }[],
    ): Promise<{ allowed: boolean; retryAfterMs: number }> => {
      if (scopes.length === 0) return { allowed: true, retryAfterMs: 0 };
      if (
        !clientIdentity ||
        scopes.some(
          (scope) =>
            !scope.key ||
            !Number.isSafeInteger(scope.limit) ||
            scope.limit < 1 ||
            !Number.isSafeInteger(scope.windowMs) ||
            scope.windowMs < 1,
        )
      )
        throw new Error('Invalid public registration rate-limit configuration');
      const clientHash = hash(clientIdentity);
      const buckets = scopes
        .map((scope) => ({ ...scope, scopeHash: hash(scope.key) }))
        .sort((a, b) => a.scopeHash.localeCompare(b.scopeHash));
      const currentTime = now();
      return db.transaction(async (tx) => {
        for (const bucket of buckets) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`${bucket.scopeHash}:${clientHash}`}, 0))`,
          );
        }
        const prepared: Array<{
          bucket: (typeof buckets)[number];
          remaining: number;
        }> = [];
        for (const bucket of buckets) {
          const rows = (
            await tx.execute(sql`
            select remaining_tokens, updated_at
            from public_registration_rate_limit
            where scope_hash = ${bucket.scopeHash} and client_hash = ${clientHash}
            for update
          `)
          ).rows as Array<{
            remaining_tokens: number | string;
            updated_at: Date | string;
          }>;
          const prior = rows[0];
          const elapsedMs = prior
            ? Math.max(0, currentTime - new Date(prior.updated_at).getTime())
            : bucket.windowMs;
          const replenished = prior
            ? Number(prior.remaining_tokens) +
              (elapsedMs * bucket.limit) / bucket.windowMs
            : bucket.limit;
          prepared.push({
            bucket,
            remaining: Math.min(bucket.limit, replenished),
          });
        }
        const blocked = prepared.filter(({ remaining }) => remaining < 1);
        if (blocked.length) {
          return {
            allowed: false,
            retryAfterMs: Math.max(
              ...blocked.map(({ bucket, remaining }) =>
                Math.max(
                  1,
                  Math.ceil(((1 - remaining) * bucket.windowMs) / bucket.limit),
                ),
              ),
            ),
          };
        }
        for (const { bucket, remaining } of prepared) {
          await tx.execute(sql`
            insert into public_registration_rate_limit
              (scope_hash, client_hash, remaining_tokens, updated_at)
            values (${bucket.scopeHash}, ${clientHash}, ${remaining - 1}, to_timestamp(${currentTime} / 1000.0))
            on conflict (scope_hash, client_hash) do update
              set remaining_tokens = excluded.remaining_tokens,
                  updated_at = excluded.updated_at
          `);
        }
        if (++calls % cleanupEvery === 0) {
          await tx.execute(sql`
            delete from public_registration_rate_limit
            where updated_at < to_timestamp(${currentTime} / 1000.0) - interval '1 day'
          `);
        }
        return { allowed: true, retryAfterMs: 0 };
      });
    },
  };
}
export function createPublicRegistrationRateLimitSettingsRepository(
  db: Database,
) {
  const organizationSettings = async (ctx: RequestContext) => {
    const [row] = await db
      .select({
        organizationLimit:
          organizationPublicRegistrationRateLimitOverrides.organizationLimit,
        eventLimit: organizationPublicRegistrationRateLimitOverrides.eventLimit,
        windowSeconds:
          organizationPublicRegistrationRateLimitOverrides.windowSeconds,
      })
      .from(organizationPublicRegistrationRateLimitOverrides)
      .where(
        eq(
          organizationPublicRegistrationRateLimitOverrides.organizationId,
          ctx.organizationId,
        ),
      );
    if (!row) return null;
    return {
      ...(row.organizationLimit !== null
        ? { organizationLimit: row.organizationLimit }
        : {}),
      ...(row.eventLimit !== null ? { eventLimit: row.eventLimit } : {}),
      ...(row.windowSeconds !== null
        ? { windowSeconds: row.windowSeconds }
        : {}),
    };
  };
  const eventSettings = async (ctx: RequestContext, eventId: string) => {
    const [row] = await db
      .select({
        eventLimit: eventPublicRegistrationRateLimitOverrides.eventLimit,
        windowSeconds: eventPublicRegistrationRateLimitOverrides.windowSeconds,
      })
      .from(eventPublicRegistrationRateLimitOverrides)
      .where(
        and(
          eq(
            eventPublicRegistrationRateLimitOverrides.organizationId,
            ctx.organizationId,
          ),
          eq(eventPublicRegistrationRateLimitOverrides.eventId, eventId),
        ),
      );
    if (!row) return null;
    return {
      ...(row.eventLimit !== null ? { eventLimit: row.eventLimit } : {}),
      ...(row.windowSeconds !== null
        ? { windowSeconds: row.windowSeconds }
        : {}),
    };
  };
  return {
    getOrganization: organizationSettings,
    getEvent: eventSettings,
    resolvePublicEvent: async (ctx: RequestContext, slug: string) => {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.slug, slug),
          ),
        );
      if (!event) return null;
      return {
        eventId: event.id,
        organization: await organizationSettings(ctx),
        event: await eventSettings(ctx, event.id),
      };
    },
    updateOrganization: async (
      ctx: RequestContext,
      settings: {
        organizationLimit?: number;
        eventLimit?: number;
        windowSeconds?: number;
      },
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [organization] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .for('update');
        if (!organization) throw new Error('Organization not found');
        const table = organizationPublicRegistrationRateLimitOverrides;
        const [before] = await tx
          .select()
          .from(table)
          .where(eq(table.organizationId, ctx.organizationId))
          .for('update');
        const after = Object.keys(settings).length ? settings : null;
        if (after) {
          await tx
            .insert(table)
            .values({ organizationId: ctx.organizationId, ...after })
            .onConflictDoUpdate({
              target: table.organizationId,
              set: after,
            });
        } else {
          await tx
            .delete(table)
            .where(eq(table.organizationId, ctx.organizationId));
        }
        await tx.insert(publicRegistrationRateLimitOverrideAudit).values({
          organizationId: ctx.organizationId,
          scope: 'organization',
          actor,
          beforeSettings: before
            ? {
                organizationLimit: before.organizationLimit,
                eventLimit: before.eventLimit,
                windowSeconds: before.windowSeconds,
              }
            : null,
          afterSettings: after ?? null,
        });
        return after;
      }),
    updateEvent: async (
      ctx: RequestContext,
      eventId: string,
      settings: { eventLimit?: number; windowSeconds?: number },
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [event] = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.id, eventId),
              eq(events.organizationId, ctx.organizationId),
            ),
          )
          .for('update');
        if (!event) return null;
        const table = eventPublicRegistrationRateLimitOverrides;
        const [before] = await tx
          .select()
          .from(table)
          .where(
            and(
              eq(table.organizationId, ctx.organizationId),
              eq(table.eventId, eventId),
            ),
          )
          .for('update');
        const after = Object.keys(settings).length ? settings : null;
        if (after) {
          await tx
            .insert(table)
            .values({
              organizationId: ctx.organizationId,
              eventId,
              ...after,
            })
            .onConflictDoUpdate({
              target: [table.organizationId, table.eventId],
              set: after,
            });
        } else {
          await tx
            .delete(table)
            .where(
              and(
                eq(table.organizationId, ctx.organizationId),
                eq(table.eventId, eventId),
              ),
            );
        }
        await tx.insert(publicRegistrationRateLimitOverrideAudit).values({
          organizationId: ctx.organizationId,
          eventId,
          scope: 'event',
          actor,
          beforeSettings: before
            ? {
                eventLimit: before.eventLimit,
                windowSeconds: before.windowSeconds,
              }
            : null,
          afterSettings: after ?? null,
        });
        return after;
      }),
  };
}
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
      sql`${t.templateKey} in ('verification','entry-received','accepted','rejected','status-change')`,
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
      sql`${t.templateKey} in ('verification','entry-received','accepted','rejected','status-change')`,
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
async function projectEntryRows(
  db: Database,
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
  db: Database,
  ctx: RequestContext,
  items: readonly import('@racepilot/core').Entry[],
): Promise<import('@racepilot/core').Entry[]> {
  if (!items.length) return [];
  const ids = items.map((item) => item.id);
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
  entries: Array<{
    classId: string;
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
      const [organization] = await db
        .select({ registrationSettings: organizations.registrationSettings })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId))
        .limit(1);
      return {
        event: {
          id: event.id,
          slug: event.slug,
          name: event.name,
          startsOn: event.startsOn,
        },
        classes: classRows,
        consents: event.consentTerms,
        registrationSettings: organization?.registrationSettings ?? {
          sharedContactEmail: 'allowed',
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        },
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
          selectedTerms.length !==
          consentTerms.filter((term) => term.language === payload.language)
            .length
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
          })
          .returning({ id: registrationGroups.id });
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
              requestedStartNumber: null,
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
