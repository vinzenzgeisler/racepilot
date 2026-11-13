import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  unique,
  check,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entries } from './entries.js';

/** The co-driver of one entry. Personal data lives here, never in the organization-wide person table. */
export const entryPassengers = pgTable(
  'entry_passenger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    emailNormalized: text('email_normalized'),
    dateOfBirth: date('date_of_birth'),
    country: text('country'),
    phone: text('phone'),
    street: text('street'),
    postalCode: text('postal_code'),
    city: text('city'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    language: text('language').$type<'de' | 'en'>().notNull().default('de'),
    source: text('source').$type<'registration' | 'admin'>().notNull(),
    createdBy: text('created_by').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('entry_passenger_org_id_unique').on(t.organizationId, t.id),
    unique('entry_passenger_org_entry_unique').on(t.organizationId, t.entryId),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.entryId],
      foreignColumns: [entries.organizationId, entries.eventId, entries.id],
      name: 'entry_passenger_entry_fk',
    }).onDelete('cascade'),
    check('entry_passenger_language_check', sql`${t.language} in ('de','en')`),
    check(
      'entry_passenger_source_check',
      sql`${t.source} in ('registration','admin')`,
    ),
    check(
      'entry_passenger_name_check',
      sql`length(trim(${t.firstName})) > 0 and length(trim(${t.lastName})) > 0`,
    ),
    check(
      'entry_passenger_created_by_check',
      sql`length(trim(${t.createdBy})) > 0`,
    ),
  ],
);

/** A personal link for the co-driver. Only the SHA-256 hash of the token is stored. */
export const entryPassengerLinks = pgTable(
  'entry_passenger_link',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    passengerId: uuid('passenger_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'entry_passenger_link_hash_check',
      sql`${t.tokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
    foreignKey({
      columns: [t.organizationId, t.passengerId],
      foreignColumns: [entryPassengers.organizationId, entryPassengers.id],
      name: 'entry_passenger_link_passenger_fk',
    }).onDelete('cascade'),
    index('entry_passenger_link_passenger_idx').on(
      t.organizationId,
      t.passengerId,
    ),
  ],
);

/** The co-driver's own acceptance of a versioned text, independent of the driver's. */
export const entryPassengerConsentEvidence = pgTable(
  'entry_passenger_consent_evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    passengerId: uuid('passenger_id').notNull(),
    textKey: text('text_key').notNull(),
    textVersion: text('text_version').notNull(),
    language: text('language').notNull(),
    textHash: text('text_hash').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.passengerId],
      foreignColumns: [entryPassengers.organizationId, entryPassengers.id],
      name: 'entry_passenger_consent_passenger_fk',
    }).onDelete('cascade'),
    index('entry_passenger_consent_idx').on(t.organizationId, t.passengerId),
  ],
);
