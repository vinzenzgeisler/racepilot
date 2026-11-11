import type {
  EntryDocumentLine,
  EntryDocumentProjection,
  EntryStatusDimensionProjection,
} from '@racepilot/core';
import { entryDocuments } from './schema/documents.js';
import { eventEntryDocumentTypes } from './schema/documents.js';

type TypeRow = typeof eventEntryDocumentTypes.$inferSelect;
type DocumentRow = typeof entryDocuments.$inferSelect;

export function projectEntryDocumentLines(
  entryId: string,
  types: readonly TypeRow[],
  documents: readonly DocumentRow[],
  dimensions: readonly EntryStatusDimensionProjection[],
): EntryDocumentProjection {
  const latestDocuments = new Map<string, DocumentRow>();
  for (const document of documents) {
    const key = `${document.entryId}:${document.typeKey}`;
    if (!latestDocuments.has(key)) latestDocuments.set(key, document);
  }
  const documentLines: EntryDocumentLine[] = types.map((type) => {
    const document = latestDocuments.get(`${entryId}:${type.key}`);
    const status: 'missing' | 'uploaded' | 'reviewed' | 'rejected' = document
      ? document.status === 'uploaded' ||
        document.status === 'reviewed' ||
        document.status === 'rejected'
        ? document.status
        : 'uploaded'
      : 'missing';
    return {
      kind: 'upload',
      key: type.key,
      label: type.name,
      required: type.required,
      status,
      hint: type.hint,
      document: document
        ? {
            id: document.id,
            organizationId: document.organizationId,
            eventId: document.eventId,
            entryId: document.entryId,
            typeKey: document.typeKey,
            objectId: document.objectId,
            fileName: document.fileName,
            contentType: document.contentType,
            size: document.size,
            sha256: document.sha256,
            status: status === 'missing' ? 'uploaded' : status,
            uploadedAt: document.uploadedAt.toISOString(),
            uploadedBy: document.uploadedBy,
            reviewedAt: document.reviewedAt?.toISOString() ?? null,
            reviewedBy: document.reviewedBy,
            rejectionReason: document.rejectionReason,
          }
        : null,
    };
  });
  const required = documentLines.filter(
    (line) => line.kind === 'upload' && line.required,
  );
  const uploadedRequiredCount = required.filter(
    (line) => line.status === 'uploaded' || line.status === 'reviewed',
  ).length;
  const waiver = dimensions.find((dimension) => dimension.key === 'waiver');
  const payment = dimensions.find((dimension) => dimension.key === 'payment');
  const lines: EntryDocumentLine[] = [...documentLines];
  if (waiver)
    lines.push({
      kind: 'waiver',
      key: 'waiver',
      label: waiver.label.de,
      status: waiver.value,
    });
  if (payment)
    lines.push({
      kind: 'payment',
      key: 'payment',
      label: payment.label.de,
      status: payment.value,
    });
  return {
    complete: uploadedRequiredCount === required.length,
    requiredCount: required.length,
    uploadedRequiredCount,
    lines,
  };
}
