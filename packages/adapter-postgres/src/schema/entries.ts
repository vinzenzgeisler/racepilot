import {
  pgTable,
  uuid,
  text,
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
import { organizations, events, eventClasses } from './organization.js';

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
    imageUrl: text('image_url'),
    vehicleType: text('vehicle_type'),
    displacementCc: integer('displacement_cc'),
    cylinders: integer('cylinders'),
    ownerName: text('owner_name'),
    history: text('history'),
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
    phone: text('phone'),
    street: text('street'),
    postalCode: text('postal_code'),
    city: text('city'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    publicationPreference: text('publication_preference'),
    customAnswers: jsonb('custom_answers')
      .$type<Record<string, string | boolean | { objectId: string }>>()
      .notNull()
      .default({}),
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
    orgaCode: text('orga_code').notNull(),
    priceSnapshotVersion: text('price_snapshot_version'),
    priceSnapshot: jsonb('price_snapshot').$type<
      import('@racepilot/core').PriceSnapshot | null
    >(),
    formSnapshotVersion: text('form_snapshot_version'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revision: integer('revision').notNull().default(1),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletionReason: text('deletion_reason'),
  },
  (t) => [
    unique('entry_org_id_unique').on(t.organizationId, t.id),
    unique('entry_org_event_id_unique').on(t.organizationId, t.eventId, t.id),
    unique('entry_org_event_orga_code_unique').on(
      t.organizationId,
      t.eventId,
      t.orgaCode,
    ),
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
export const entryDataAuditEvents = pgTable(
  'entry_data_audit_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    subject: text('subject').notNull(),
    changes: jsonb('changes')
      .$type<
        Record<
          string,
          { from: string | number | null; to: string | number | null }
        >
      >()
      .notNull(),
    actor: text('actor').notNull(),
    copiedFromId: uuid('copied_from_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.entryId],
      foreignColumns: [entries.organizationId, entries.id],
      name: 'entry_data_audit_entry_fk',
    }).onDelete('cascade'),
    check(
      'entry_data_audit_subject_check',
      sql`${t.subject} in ('driver','vehicle')`,
    ),
    check('entry_data_audit_actor_check', sql`length(trim(${t.actor})) > 0`),
    index('entry_data_audit_entry_idx').on(
      t.organizationId,
      t.entryId,
      t.occurredAt,
    ),
  ],
);
