import {
  pgTable,
  primaryKey,
  uuid,
  text,
  timestamp,
  check,
  index,
  integer,
  doublePrecision,
  foreignKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, events } from './organization.js';
import { registrationGroups } from './entries.js';

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
