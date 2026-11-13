import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  EntryDocumentsRepository,
  EntryDocumentResult,
  EntryDocument,
  EntryDocumentType,
  EntryDocumentStatus,
} from '@racepilot/core';
import type { Database } from './database.js';
import { withOrganizationTransaction } from './database-service.js';
import { entries } from './schema/entries.js';
import {
  eventEntryDocumentTypes,
  entryDocuments,
  entryDocumentAudit,
} from './schema/documents.js';

const result = <T>(value: T): EntryDocumentResult<T> => ({ ok: true, value });
const statusOf = (value: string): EntryDocumentStatus => {
  if (value === 'uploaded' || value === 'reviewed' || value === 'rejected')
    return value;
  throw new Error('Invalid persisted entry document status');
};
const mapDocument = (
  row: typeof entryDocuments.$inferSelect,
): EntryDocument => ({
  id: row.id,
  organizationId: row.organizationId,
  eventId: row.eventId,
  entryId: row.entryId,
  typeKey: row.typeKey,
  objectId: row.objectId,
  fileName: row.fileName,
  contentType: row.contentType,
  size: row.size,
  sha256: row.sha256,
  status: statusOf(row.status),
  uploadedAt: row.uploadedAt.toISOString(),
  uploadedBy: row.uploadedBy,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  reviewedBy: row.reviewedBy,
  rejectionReason: row.rejectionReason,
});

const mapType = (
  row: typeof eventEntryDocumentTypes.$inferSelect,
  configured: boolean,
): EntryDocumentType => ({
  key: row.key,
  eventId: row.eventId,
  name: row.name,
  required: row.required,
  hint: row.hint,
  ...(configured ? { enabled: row.enabled } : {}),
});

export function createEntryDocumentsRepository(
  db: Database,
): EntryDocumentsRepository {
  return {
    listTypes: async (ctx, eventId) =>
      (
        await db
          .select()
          .from(eventEntryDocumentTypes)
          .where(
            and(
              eq(eventEntryDocumentTypes.organizationId, ctx.organizationId),
              eq(eventEntryDocumentTypes.eventId, eventId),
              eq(eventEntryDocumentTypes.enabled, true),
            ),
          )
      ).map((row) => mapType(row, false)),
    listConfiguredTypes: async (ctx, eventId) =>
      (
        await db
          .select()
          .from(eventEntryDocumentTypes)
          .where(
            and(
              eq(eventEntryDocumentTypes.organizationId, ctx.organizationId),
              eq(eventEntryDocumentTypes.eventId, eventId),
            ),
          )
      ).map((row) => mapType(row, true)),
    saveTypes: async (ctx, eventId, types, actor) => {
      if (!actor.trim())
        return { ok: false, error: 'invalid', reason: 'actor_required' };
      return withOrganizationTransaction(db, ctx, async (tx) => {
        const eventResult = await tx.execute(
          sql`select id from event where organization_id=${ctx.organizationId} and id=${eventId} for update`,
        );
        const eventExists = eventResult.rows.length > 0;
        if (!eventExists)
          return { ok: false, error: 'not_found', reason: 'event_not_found' };
        await tx
          .update(eventEntryDocumentTypes)
          .set({ enabled: false, updatedAt: new Date() })
          .where(
            and(
              eq(eventEntryDocumentTypes.organizationId, ctx.organizationId),
              eq(eventEntryDocumentTypes.eventId, eventId),
            ),
          );
        for (const type of types)
          await tx
            .insert(eventEntryDocumentTypes)
            .values({
              organizationId: ctx.organizationId,
              eventId,
              key: type.key,
              name: type.name,
              required: type.required,
              hint: type.hint,
              enabled: type.enabled ?? true,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                eventEntryDocumentTypes.organizationId,
                eventEntryDocumentTypes.eventId,
                eventEntryDocumentTypes.key,
              ],
              set: {
                name: type.name,
                required: type.required,
                hint: type.hint,
                enabled: type.enabled ?? true,
                updatedAt: new Date(),
              },
            });
        return result(types.map((type) => ({ ...type, eventId })));
      });
    },
    getEntry: async (ctx, entryId) => {
      const [row] = await db
        .select({ id: entries.id, eventId: entries.eventId })
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.id, entryId),
            sql`${entries.deletedAt} is null`,
          ),
        )
        .limit(1);
      return row ?? null;
    },
    listByEntry: async (ctx, entryId) => {
      const entry = await db
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.id, entryId),
            sql`${entries.deletedAt} is null`,
          ),
        )
        .limit(1);
      if (!entry.length)
        return { ok: false, error: 'not_found', reason: 'entry_not_found' };
      const rows = await db
        .select()
        .from(entryDocuments)
        .where(
          and(
            eq(entryDocuments.organizationId, ctx.organizationId),
            eq(entryDocuments.entryId, entryId),
          ),
        )
        .orderBy(desc(entryDocuments.uploadedAt), desc(entryDocuments.id));
      return result(rows.map(mapDocument));
    },
    upload: async (ctx, input) =>
      withOrganizationTransaction(db, ctx, async (tx) => {
        const [entry] = await tx
          .select({ eventId: entries.eventId })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, input.entryId),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .limit(1);
        if (!entry)
          return { ok: false, error: 'not_found', reason: 'entry_not_found' };
        const [type] = await tx
          .select({ key: eventEntryDocumentTypes.key })
          .from(eventEntryDocumentTypes)
          .where(
            and(
              eq(eventEntryDocumentTypes.organizationId, ctx.organizationId),
              eq(eventEntryDocumentTypes.eventId, entry.eventId),
              eq(eventEntryDocumentTypes.key, input.typeKey),
              eq(eventEntryDocumentTypes.enabled, true),
            ),
          )
          .limit(1);
        if (!type)
          return {
            ok: false,
            error: 'invalid',
            reason: 'document_type_unavailable',
          };
        const [row] = await tx
          .insert(entryDocuments)
          .values({
            organizationId: ctx.organizationId,
            eventId: entry.eventId,
            entryId: input.entryId,
            typeKey: input.typeKey,
            objectId: input.objectId,
            fileName: input.fileName,
            contentType: input.contentType,
            size: input.size,
            sha256: input.sha256,
            uploadedBy: input.actor,
          })
          .returning();
        return result(mapDocument(row!));
      }),
    decide: async (ctx, input) =>
      withOrganizationTransaction(db, ctx, async (tx) => {
        const [row] = await tx
          .select()
          .from(entryDocuments)
          .innerJoin(
            entries,
            and(
              eq(entries.organizationId, entryDocuments.organizationId),
              eq(entries.eventId, entryDocuments.eventId),
              eq(entries.id, entryDocuments.entryId),
            ),
          )
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, input.entryId),
              sql`${entries.deletedAt} is null`,
              eq(entryDocuments.id, input.documentId),
              eq(entryDocuments.status, 'uploaded'),
            ),
          )
          .limit(1);
        if (!row) {
          const [exists] = await tx
            .select({ id: entryDocuments.id })
            .from(entryDocuments)
            .where(
              and(
                eq(entryDocuments.organizationId, ctx.organizationId),
                eq(entryDocuments.entryId, input.entryId),
                eq(entryDocuments.id, input.documentId),
              ),
            )
            .limit(1);
          return exists
            ? { ok: false, error: 'conflict', reason: 'document_not_uploaded' }
            : { ok: false, error: 'not_found', reason: 'document_not_found' };
        }
        const prior = row.entry_document;
        const reviewedAt = new Date();
        const [updated] = await tx
          .update(entryDocuments)
          .set({
            status: input.status,
            reviewedAt,
            reviewedBy: input.actor,
            rejectionReason: input.status === 'rejected' ? input.reason : null,
          })
          .where(
            and(
              eq(entryDocuments.organizationId, ctx.organizationId),
              eq(entryDocuments.entryId, input.entryId),
              eq(entryDocuments.id, input.documentId),
              eq(entryDocuments.status, 'uploaded'),
            ),
          )
          .returning();
        if (!updated)
          return {
            ok: false,
            error: 'conflict',
            reason: 'document_not_uploaded',
          };
        await tx.insert(entryDocumentAudit).values({
          organizationId: ctx.organizationId,
          eventId: prior.eventId,
          entryId: prior.entryId,
          documentId: prior.id,
          fromStatus: 'uploaded',
          toStatus: input.status,
          actor: input.actor,
          reason: input.reason || null,
          occurredAt: reviewedAt,
        });
        return result(mapDocument(updated));
      }),
  };
}
