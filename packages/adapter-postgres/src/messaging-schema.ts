import {
  pgTable,
  uuid,
  text,
  timestamp,
  foreignKey,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { organizations, events } from './schema/organization.js';
import { entries } from './schema/entries.js';
import { emailOutbox } from './mail-schema.js';

export const messageTemplates = pgTable(
  'message_template',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id'),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    textBody: text('text_body').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('message_template_org_id_unique').on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: 'message_template_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'message_template_event_fk',
    }).onDelete('cascade'),
  ],
);

export const messageCampaigns = pgTable(
  'message_campaign',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    subject: text('subject').notNull(),
    textBody: text('text_body').notNull(),
    status: text('status').notNull().default('planned'),
    actor: text('actor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('message_campaign_org_id_unique').on(table.organizationId, table.id),
    unique('message_campaign_org_idempotency_unique').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: 'message_campaign_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'message_campaign_event_fk',
    }).onDelete('cascade'),
    index('message_campaign_event_idx').on(
      table.organizationId,
      table.eventId,
      table.createdAt,
    ),
  ],
);

export const messageCampaignRecipients = pgTable(
  'message_campaign_recipient',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    campaignId: uuid('campaign_id').notNull(),
    eventId: uuid('event_id').notNull(),
    entryId: uuid('entry_id'),
    outboxId: uuid('outbox_id'),
    email: text('email').notNull(),
    subject: text('subject').notNull(),
    status: text('status').notNull().default('planned'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.campaignId],
      foreignColumns: [messageCampaigns.organizationId, messageCampaigns.id],
      name: 'message_campaign_recipient_campaign_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.entryId],
      foreignColumns: [entries.organizationId, entries.eventId, entries.id],
      name: 'message_campaign_recipient_entry_fk',
    }),
    foreignKey({
      columns: [table.organizationId, table.outboxId],
      foreignColumns: [emailOutbox.organizationId, emailOutbox.id],
      name: 'message_campaign_recipient_outbox_fk',
    }),
    unique('message_campaign_recipient_org_campaign_email_unique').on(
      table.organizationId,
      table.campaignId,
      table.email,
    ),
    index('message_campaign_recipient_outbox_idx').on(
      table.organizationId,
      table.outboxId,
    ),
  ],
);

export const messageCampaignAudits = pgTable(
  'message_campaign_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    campaignId: uuid('campaign_id').notNull(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.campaignId],
      foreignColumns: [messageCampaigns.organizationId, messageCampaigns.id],
      name: 'message_campaign_audit_campaign_fk',
    }).onDelete('cascade'),
  ],
);
