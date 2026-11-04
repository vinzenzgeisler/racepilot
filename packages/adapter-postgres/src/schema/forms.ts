import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  check,
  index,
  foreignKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, events } from './organization.js';
import { registrationGroups } from './entries.js';

export const registrationFormDrafts = pgTable(
  'registration_form_draft',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    language: text('language').notNull(),
    draftData: jsonb('draft_data').$type<Record<string, unknown>>().notNull(),
    resumeTokenHash: text('resume_token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('registration_form_draft_scope_email_unique').on(
      t.organizationId,
      t.eventId,
      t.emailNormalized,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'registration_form_draft_event_fk',
    }).onDelete('cascade'),
    index('registration_form_draft_expiry_idx').on(t.expiresAt),
  ],
);
export const registrationFormUploads = pgTable(
  'registration_form_upload',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    registrationGroupId: uuid('registration_group_id'),
    fieldKey: text('field_key').notNull(),
    objectId: uuid('object_id').notNull(),
    uploadTokenHash: text('upload_token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('registration_form_upload_org_object_unique').on(
      t.organizationId,
      t.objectId,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'registration_form_upload_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'registration_form_upload_group_fk',
    }).onDelete('cascade'),
    check(
      'registration_form_upload_field_key_check',
      sql`${t.fieldKey} ~ '^[a-z][a-z0-9_-]{0,39}$'`,
    ),
    check(
      'registration_form_upload_token_hash_check',
      sql`${t.uploadTokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
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
export const registrationFormConfigAudit = pgTable(
  'registration_form_config_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id'),
    actor: text('actor').notNull(),
    beforeConfig: jsonb('before_config'),
    afterConfig: jsonb('after_config').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
      name: 'registration_form_config_audit_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'registration_form_config_audit_event_fk',
    }).onDelete('cascade'),
  ],
);
