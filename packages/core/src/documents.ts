import type { RequestContext } from './context.js';
import type { ObjectStorageProvider } from './providers.js';

export const ENTRY_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ENTRY_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export interface EntryDocumentType {
  readonly key: string;
  readonly eventId: string;
  readonly name: string;
  readonly required: boolean;
  readonly hint: string | null;
}

export type EntryDocumentStatus = 'uploaded' | 'reviewed' | 'rejected';
export interface EntryDocument {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly entryId: string;
  readonly typeKey: string;
  readonly objectId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly sha256: string;
  readonly status: EntryDocumentStatus;
  readonly uploadedAt: string;
  readonly uploadedBy: string;
  readonly reviewedAt: string | null;
  readonly reviewedBy: string | null;
  readonly rejectionReason: string | null;
}

export type EntryDocumentErrorCode =
  | 'actor_required'
  | 'decision_reason_required'
  | 'document_not_found'
  | 'document_not_uploaded'
  | 'document_persistence_failed'
  | 'document_type_unavailable'
  | 'document_types_invalid'
  | 'entry_not_found'
  | 'entry_read_required'
  | 'entry_write_required'
  | 'event_not_found'
  | 'file_content_invalid'
  | 'file_invalid'
  | 'file_metadata_invalid'
  | 'storage_tenant_mismatch'
  | 'storage_unavailable';

export type EntryDocumentResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error:
        'not_found' | 'conflict' | 'invalid' | 'forbidden' | 'unavailable';
      readonly reason: EntryDocumentErrorCode;
    };

export interface EntryDocumentsRepository {
  listTypes(ctx: RequestContext, eventId: string): Promise<EntryDocumentType[]>;
  saveTypes(
    ctx: RequestContext,
    eventId: string,
    types: readonly Omit<EntryDocumentType, 'eventId'>[],
    actor: string,
  ): Promise<EntryDocumentResult<EntryDocumentType[]>>;
  getEntry(
    ctx: RequestContext,
    entryId: string,
  ): Promise<{ id: string; eventId: string } | null>;
  listByEntry(
    ctx: RequestContext,
    entryId: string,
  ): Promise<EntryDocumentResult<EntryDocument[]>>;
  upload(
    ctx: RequestContext,
    input: {
      entryId: string;
      typeKey: string;
      fileName: string;
      contentType: string;
      size: number;
      sha256: string;
      objectId: string;
      actor: string;
    },
  ): Promise<EntryDocumentResult<EntryDocument>>;
  decide(
    ctx: RequestContext,
    input: {
      entryId: string;
      documentId: string;
      status: 'reviewed' | 'rejected';
      reason: string;
      actor: string;
    },
  ): Promise<EntryDocumentResult<EntryDocument>>;
}

export type EntryDocumentLine =
  | {
      readonly kind: 'upload';
      readonly key: string;
      readonly label: string;
      readonly required: boolean;
      readonly status: 'missing' | EntryDocumentStatus;
      readonly hint: string | null;
      readonly document: EntryDocument | null;
    }
  | {
      readonly kind: 'waiver';
      readonly key: 'waiver';
      readonly label: string;
      readonly status: string;
    }
  | {
      readonly kind: 'payment';
      readonly key: 'payment';
      readonly label: string;
      readonly status: string;
    };

export interface EntryDocumentProjection {
  readonly complete: boolean;
  readonly requiredCount: number;
  readonly uploadedRequiredCount: number;
  readonly lines: readonly EntryDocumentLine[];
}

export async function getEntryDocumentProjection(
  ctx: RequestContext,
  entryId: string,
  deps: { documents: EntryDocumentsRepository },
): Promise<EntryDocumentResult<EntryDocumentProjection>> {
  if (!ctx.permissions.has('entry:read'))
    return { ok: false, error: 'forbidden', reason: 'entry_read_required' };
  const entry = await deps.documents.getEntry(ctx, entryId);
  if (!entry)
    return { ok: false, error: 'not_found', reason: 'entry_not_found' };
  const result = await deps.documents.listByEntry(ctx, entryId);
  if (!result.ok) return result;
  const docs = result.value;
  const types = await deps.documents.listTypes(ctx, entry.eventId);
  const byType = new Map<string, EntryDocument>();
  for (const document of docs)
    if (!byType.has(document.typeKey)) byType.set(document.typeKey, document);
  const lines: EntryDocumentLine[] = types.map((type) => {
    const document = byType.get(type.key) ?? null;
    return {
      kind: 'upload',
      key: type.key,
      label: type.name,
      required: type.required,
      status: document?.status ?? 'missing',
      hint: type.hint,
      document,
    };
  });
  const required = lines.filter(
    (line) => line.kind === 'upload' && line.required,
  );
  const uploadedRequiredCount = required.filter(
    (line) => line.status === 'uploaded' || line.status === 'reviewed',
  ).length;
  return {
    ok: true,
    value: {
      complete: required.length === uploadedRequiredCount,
      requiredCount: required.length,
      uploadedRequiredCount,
      lines,
    },
  };
}

export async function setEntryDocumentTypes(
  ctx: RequestContext,
  eventId: string,
  types: readonly Omit<EntryDocumentType, 'eventId'>[],
  actor: string,
  deps: { documents: EntryDocumentsRepository },
): Promise<EntryDocumentResult<EntryDocumentType[]>> {
  if (!ctx.permissions.has('entry:write'))
    return { ok: false, error: 'forbidden', reason: 'entry_write_required' };
  if (
    !eventId.trim() ||
    !actor.trim() ||
    types.length > 30 ||
    new Set(types.map((type) => type.key)).size !== types.length ||
    types.some(
      (type) =>
        !/^[a-z][a-z0-9_-]{0,63}$/.test(type.key) ||
        !type.name.trim() ||
        type.name.length > 120 ||
        (type.hint?.length ?? 0) > 500,
    )
  )
    return { ok: false, error: 'invalid', reason: 'document_types_invalid' };
  return deps.documents.saveTypes(ctx, eventId, types, actor);
}

export async function uploadEntryDocument(
  ctx: RequestContext,
  input: {
    entryId: string;
    typeKey: string;
    fileName: string;
    contentType: string;
    body: Uint8Array;
    actor: string;
  },
  deps: { documents: EntryDocumentsRepository; storage: ObjectStorageProvider },
): Promise<EntryDocumentResult<EntryDocument>> {
  if (!ctx.permissions.has('entry:write'))
    return { ok: false, error: 'forbidden', reason: 'entry_write_required' };
  if (
    input.body.length === 0 ||
    input.body.length > ENTRY_DOCUMENT_MAX_BYTES ||
    !ENTRY_DOCUMENT_TYPES.some((type) => type === input.contentType)
  )
    return { ok: false, error: 'invalid', reason: 'file_invalid' };
  if (
    !input.actor.trim() ||
    !input.fileName.trim() ||
    input.fileName.length > 255
  )
    return { ok: false, error: 'invalid', reason: 'file_metadata_invalid' };
  const bytes = input.body;
  const validPdf =
    input.contentType === 'application/pdf' &&
    new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  const validPng =
    input.contentType === 'image/png' &&
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    );
  const validJpeg =
    input.contentType === 'image/jpeg' &&
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  if (!validPdf && !validPng && !validJpeg)
    return { ok: false, error: 'invalid', reason: 'file_content_invalid' };
  const entry = await deps.documents.getEntry(ctx, input.entryId);
  if (!entry)
    return { ok: false, error: 'not_found', reason: 'entry_not_found' };
  let stored;
  try {
    stored = await deps.storage.put({
      organizationId: ctx.organizationId,
      body: input.body,
      contentType: input.contentType,
    });
  } catch {
    return { ok: false, error: 'unavailable', reason: 'storage_unavailable' };
  }
  if (stored.organizationId !== ctx.organizationId)
    return {
      ok: false,
      error: 'unavailable',
      reason: 'storage_tenant_mismatch',
    };
  try {
    const result = await deps.documents.upload(ctx, {
      entryId: entry.id,
      typeKey: input.typeKey,
      fileName: input.fileName,
      contentType: stored.contentType,
      size: stored.size,
      sha256: stored.sha256,
      objectId: stored.objectId,
      actor: input.actor,
    });
    if (!result.ok)
      await deps.storage.delete(ctx.organizationId, stored.objectId);
    return result;
  } catch {
    await deps.storage.delete(ctx.organizationId, stored.objectId);
    return {
      ok: false,
      error: 'unavailable',
      reason: 'document_persistence_failed',
    };
  }
}

export async function decideEntryDocument(
  ctx: RequestContext,
  input: {
    entryId: string;
    documentId: string;
    status: 'reviewed' | 'rejected';
    reason: string;
    actor: string;
  },
  deps: { documents: EntryDocumentsRepository },
): Promise<EntryDocumentResult<EntryDocument>> {
  if (!ctx.permissions.has('entry:write'))
    return { ok: false, error: 'forbidden', reason: 'entry_write_required' };
  if (
    !input.actor.trim() ||
    (input.status === 'rejected' && !input.reason.trim())
  )
    return { ok: false, error: 'invalid', reason: 'decision_reason_required' };
  return deps.documents.decide(ctx, input);
}
