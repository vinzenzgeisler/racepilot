import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  primaryKey,
  foreignKey,
  index,
  check,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { events } from './organization.js';
import { entries } from './entries.js';

export const eventEntryDocumentTypes = pgTable(
  'event_entry_document_type',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    required: boolean('required').notNull(),
    hint: text('hint'),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId, t.key] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_entry_document_type_event_fk',
    }).onDelete('cascade'),
  ],
);

export const entryDocuments = pgTable(
  'entry_document',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    typeKey: text('type_key').notNull(),
    objectId: uuid('object_id').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    status: text('status').notNull().default('uploaded'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedBy: text('uploaded_by').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
    rejectionReason: text('rejection_reason'),
  },
  (t) => [
    unique('entry_document_org_event_entry_id_unique').on(
      t.organizationId,
      t.eventId,
      t.entryId,
      t.id,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.entryId],
      foreignColumns: [entries.organizationId, entries.eventId, entries.id],
      name: 'entry_document_entry_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.typeKey],
      foreignColumns: [
        eventEntryDocumentTypes.organizationId,
        eventEntryDocumentTypes.eventId,
        eventEntryDocumentTypes.key,
      ],
      name: 'entry_document_type_fk',
    }),
    index('entry_document_entry_type_uploaded_idx').on(
      t.organizationId,
      t.entryId,
      t.typeKey,
      t.uploadedAt,
    ),
    index('entry_document_object_idx').on(t.organizationId, t.objectId),
    check(
      'entry_document_status_check',
      sql`${t.status} in ('uploaded','reviewed','rejected')`,
    ),
    check(
      'entry_document_file_check',
      sql`${t.size} > 0 and length(trim(${t.fileName})) > 0 and ${t.contentType} in ('application/pdf','image/jpeg','image/png')`,
    ),
    check(
      'entry_document_review_check',
      sql`(${t.status} = 'uploaded' and ${t.reviewedAt} is null and ${t.reviewedBy} is null and ${t.rejectionReason} is null) or (${t.status} = 'reviewed' and ${t.reviewedAt} is not null and ${t.reviewedBy} is not null and ${t.rejectionReason} is null) or (${t.status} = 'rejected' and ${t.reviewedAt} is not null and ${t.reviewedBy} is not null and length(trim(${t.rejectionReason})) > 0)`,
    ),
  ],
);

export const entryDocumentAudit = pgTable(
  'entry_document_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    documentId: uuid('document_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId, t.entryId],
      foreignColumns: [entries.organizationId, entries.eventId, entries.id],
      name: 'entry_document_audit_entry_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.entryId, t.documentId],
      foreignColumns: [
        entryDocuments.organizationId,
        entryDocuments.eventId,
        entryDocuments.entryId,
        entryDocuments.id,
      ],
      name: 'entry_document_audit_document_fk',
    }).onDelete('cascade'),
    index('entry_document_audit_entry_idx').on(
      t.organizationId,
      t.entryId,
      t.occurredAt,
    ),
  ],
);
