import {
  pgTable,
  primaryKey,
  uuid,
  text,
  timestamp,
  check,
  index,
  foreignKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { events } from './organization.js';
import { entries } from './entries.js';

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
