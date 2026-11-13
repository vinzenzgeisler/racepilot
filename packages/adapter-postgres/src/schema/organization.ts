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
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
    registrationFormConfig: jsonb('registration_form_config').$type<Record<
      string,
      unknown
    > | null>(),
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
    orgaCodePrefix: text('orga_code_prefix'),
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
          required?: boolean;
        }>
      >()
      .notNull()
      .default([]),
    registrationFormConfig: jsonb('registration_form_config').$type<Record<
      string,
      unknown
    > | null>(),
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
    passengerMode: text('passenger_mode').notNull().default('optional'),
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
      'event_class_passenger_mode_check',
      sql`${t.passengerMode} in ('none','optional','required')`,
    ),
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
