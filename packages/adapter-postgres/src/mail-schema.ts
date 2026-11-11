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

import { organizations, events } from './schema/organization.js';

import { sql } from 'drizzle-orm';

import { registrationGroups } from './schema/entries.js';

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
      sql`${t.templateKey} in ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign')`,
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
    attachmentRefs: jsonb('attachment_refs')
      .$type<Array<{ objectId: string; filename: string }>>()
      .notNull()
      .default([]),
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
      sql`${t.templateKey} in ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign')`,
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
