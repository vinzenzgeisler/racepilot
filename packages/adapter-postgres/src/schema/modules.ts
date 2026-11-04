import {
  pgTable,
  primaryKey,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  foreignKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { organizations, events } from './organization.js';

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
