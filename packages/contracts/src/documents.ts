import { z } from 'zod';

export const ENTRY_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ENTRY_DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;
export const EntryDocumentContentType = z.enum(ENTRY_DOCUMENT_CONTENT_TYPES);
export const EntryDocumentStatus = z.enum(['uploaded', 'reviewed', 'rejected']);
export const EntryDocumentTypeSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  name: z.string().trim().min(1).max(120),
  required: z.boolean(),
  hint: z.string().trim().max(500).nullable(),
});
export const UpdateEntryDocumentTypesRequest = z
  .object({
    types: z.array(EntryDocumentTypeSchema).max(30),
  })
  .strict()
  .refine(
    ({ types }) => new Set(types.map(({ key }) => key)).size === types.length,
  );
export const EntryDocumentUploadRequest = z.object({
  typeKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  fileName: z.string().trim().min(1).max(255),
  contentType: EntryDocumentContentType,
});
export const EntryDocumentDecisionRequest = z
  .object({
    reason: z.string().trim().max(1000),
  })
  .strict();

export const EntryDocumentRecordSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    eventId: z.string().uuid(),
    entryId: z.string().uuid(),
    typeKey: z.string(),
    objectId: z.string().uuid(),
    fileName: z.string(),
    contentType: EntryDocumentContentType,
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: EntryDocumentStatus,
    uploadedAt: z.string().datetime({ offset: true }),
    uploadedBy: z.string(),
    reviewedAt: z.string().datetime({ offset: true }).nullable(),
    reviewedBy: z.string().nullable(),
    rejectionReason: z.string().nullable(),
  })
  .strict();
export const EntryDocumentLineSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('upload'),
      key: z.string(),
      label: z.string(),
      required: z.boolean(),
      status: z.union([z.literal('missing'), EntryDocumentStatus]),
      hint: z.string().nullable(),
      document: EntryDocumentRecordSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('waiver'),
      key: z.literal('waiver'),
      label: z.string(),
      status: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('payment'),
      key: z.literal('payment'),
      label: z.string(),
      status: z.string(),
    })
    .strict(),
]);
export const EntryDocumentProjectionSchema = z
  .object({
    complete: z.boolean(),
    requiredCount: z.number().int().nonnegative(),
    uploadedRequiredCount: z.number().int().nonnegative(),
    lines: z.array(EntryDocumentLineSchema),
  })
  .strict();
