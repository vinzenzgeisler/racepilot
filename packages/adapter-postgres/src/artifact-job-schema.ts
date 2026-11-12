import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  check,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  ArtifactJob,
  ArtifactKind,
  EntryExportFilters,
} from '@racepilot/core';
import { events } from './schema/organization.js';
import { registrationGroups } from './schema/entries.js';

export const artifactJobs = pgTable(
  'artifact_job',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    kind: text('kind').$type<ArtifactKind>().notNull(),
    registrationGroupId: uuid('registration_group_id'),
    fields: jsonb('fields').$type<string[]>().notNull().default([]),
    filters: jsonb('filters').$type<EntryExportFilters>().notNull().default({}),
    delimiter: text('delimiter').$type<',' | ';'>().notNull().default(';'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status')
      .$type<ArtifactJob['status']>()
      .notNull()
      .default('queued'),
    objectId: uuid('object_id'),
    sha256: text('sha256'),
    contentType: text('content_type'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimToken: uuid('claim_token'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('artifact_job_org_id_unique').on(t.organizationId, t.id),
    check('artifact_job_delimiter_check', sql`${t.delimiter} in (',',';')`),
    unique('artifact_job_org_idempotency_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'artifact_job_org_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'artifact_job_group_fk',
    }).onDelete('cascade'),
    index('artifact_job_org_status_idx').on(
      t.organizationId,
      t.status,
      t.createdAt,
    ),
  ],
);

export const artifactJobAudit = pgTable(
  'artifact_job_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    artifactJobId: uuid('artifact_job_id').notNull(),
    actor: text('actor').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'artifact_job_audit_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.artifactJobId],
      foreignColumns: [artifactJobs.organizationId, artifactJobs.id],
      name: 'artifact_job_audit_job_fk',
    }).onDelete('cascade'),
    index('artifact_job_audit_org_event_idx').on(
      t.organizationId,
      t.eventId,
      t.occurredAt,
    ),
  ],
);
