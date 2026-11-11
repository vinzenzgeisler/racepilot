import {
  pgTable,
  uuid,
  text,
  timestamp,
  foreignKey,
  check,
  index,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entries } from './entries.js';

export const entryNotes = pgTable(
  'entry_note',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    visibility: text('visibility').notNull(),
    body: text('body').notNull(),
    actor: text('actor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.entryId],
      foreignColumns: [entries.organizationId, entries.id],
      name: 'entry_note_entry_fk',
    }).onDelete('cascade'),
    check(
      'entry_note_visibility_check',
      sql`${t.visibility} in ('internal','driver')`,
    ),
    check('entry_note_body_check', sql`length(trim(${t.body})) > 0`),
    check('entry_note_actor_check', sql`length(trim(${t.actor})) > 0`),
    index('entry_note_entry_idx').on(t.organizationId, t.entryId, t.createdAt),
  ],
);

export const entryAdminActionAuditEvents = pgTable(
  'entry_admin_action_audit_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    action: text('action').notNull(),
    beforeValue: jsonb('before_value').$type<unknown>(),
    afterValue: jsonb('after_value').$type<unknown>(),
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
      name: 'entry_admin_action_entry_fk',
    }).onDelete('cascade'),
    check(
      'entry_admin_action_name_check',
      sql`${t.action} in ('class_changed','amount_adjusted','deleted','restored')`,
    ),
    check('entry_admin_action_actor_check', sql`length(trim(${t.actor})) > 0`),
    check(
      'entry_admin_action_reason_check',
      sql`length(trim(${t.reason})) > 0`,
    ),
    index('entry_admin_action_entry_idx').on(
      t.organizationId,
      t.entryId,
      t.occurredAt,
    ),
  ],
);

export const entryAmountAdjustments = pgTable(
  'entry_amount_adjustment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    originalCents: integer('original_cents').notNull(),
    adjustedCents: integer('adjusted_cents').notNull(),
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
      name: 'entry_amount_adjustment_entry_fk',
    }).onDelete('cascade'),
    check(
      'entry_amount_adjustment_nonnegative_check',
      sql`${t.originalCents} >= 0 and ${t.adjustedCents} >= 0`,
    ),
    check(
      'entry_amount_adjustment_actor_check',
      sql`length(trim(${t.actor})) > 0`,
    ),
    check(
      'entry_amount_adjustment_reason_check',
      sql`length(trim(${t.reason})) > 0`,
    ),
    index('entry_amount_adjustment_entry_idx').on(
      t.organizationId,
      t.entryId,
      t.occurredAt,
    ),
  ],
);
