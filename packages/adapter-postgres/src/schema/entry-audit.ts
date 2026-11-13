import {
  pgTable,
  uuid,
  text,
  timestamp,
  check,
  index,
  foreignKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entries } from './entries.js';

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
