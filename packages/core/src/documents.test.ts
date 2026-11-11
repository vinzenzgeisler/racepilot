import { describe, expect, it } from 'vitest';
import { createRequestContext, organizationId } from './context.js';
import {
  decideEntryDocument,
  uploadEntryDocument,
  ENTRY_DOCUMENT_MAX_BYTES,
  getEntryDocumentProjection,
  type EntryDocumentsRepository,
  type EntryDocument,
} from './documents.js';
import type { ObjectStorageProvider } from './providers.js';

const context = createRequestContext({
  deploymentMode: 'community',
  organizationId: organizationId('org-a'),
  permissions: new Set(['entry:read', 'entry:write']),
  capabilities: new Set(),
  correlationId: 'test',
});
const entry = { id: 'entry-a', eventId: 'event-a' };
const doc: EntryDocument = {
  id: 'doc-a',
  organizationId: 'org-a',
  eventId: 'event-a',
  entryId: 'entry-a',
  typeKey: 'license',
  objectId: 'object-a',
  fileName: 'license.pdf',
  contentType: 'application/pdf',
  size: 12,
  sha256: 'a'.repeat(64),
  status: 'uploaded',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: 'admin',
  reviewedAt: null,
  reviewedBy: null,
  rejectionReason: null,
};
const repository: EntryDocumentsRepository = {
  listTypes: async () => [
    {
      key: 'license',
      eventId: 'event-a',
      name: 'Fahrerlizenz',
      required: true,
      hint: null,
    },
  ],
  saveTypes: async () => ({ ok: true, value: [] }),
  getEntry: async () => entry,
  listByEntry: async () => ({ ok: true, value: [doc] }),
  upload: async () => ({ ok: true, value: doc }),
  decide: async (_ctx, input) => ({
    ok: true,
    value: {
      ...doc,
      status: input.status,
      rejectionReason: input.status === 'rejected' ? input.reason : null,
    },
  }),
};
const storage: ObjectStorageProvider = {
  put: async ({ organizationId: owner, body, contentType }) => ({
    organizationId: owner,
    objectId: 'object-a',
    contentType,
    size: body.length,
    sha256: 'a'.repeat(64),
  }),
  get: async () => null,
  delete: async () => undefined,
};

describe('entry document use cases', () => {
  it('projects completion only from actual document records', async () => {
    const projection = await getEntryDocumentProjection(context, 'entry-a', {
      documents: repository,
    });
    expect(projection).toMatchObject({
      ok: true,
      value: { complete: true, requiredCount: 1, uploadedRequiredCount: 1 },
    });
  });

  it('does not count missing optional files or rejected required files as complete', async () => {
    const optional = {
      key: 'vehicle',
      eventId: 'event-a',
      name: 'Fahrzeugschein',
      required: false,
      hint: null,
    };
    const required = {
      key: 'license',
      eventId: 'event-a',
      name: 'Fahrerlizenz',
      required: true,
      hint: null,
    };
    const emptyRepository: EntryDocumentsRepository = {
      ...repository,
      listTypes: async () => [required, optional],
      listByEntry: async () => ({ ok: true, value: [] }),
    };
    const missing = await getEntryDocumentProjection(context, 'entry-a', {
      documents: emptyRepository,
    });
    expect(missing).toMatchObject({
      ok: true,
      value: { complete: false, requiredCount: 1, uploadedRequiredCount: 0 },
    });
    if (missing.ok) expect(missing.value.lines).toHaveLength(2);
    const rejectedRepository: EntryDocumentsRepository = {
      ...repository,
      listTypes: async () => [required, optional],
      listByEntry: async () => ({
        ok: true,
        value: [{ ...doc, status: 'rejected', rejectionReason: 'Unleserlich' }],
      }),
    };
    expect(
      await getEntryDocumentProjection(context, 'entry-a', {
        documents: rejectedRepository,
      }),
    ).toMatchObject({
      ok: true,
      value: { complete: false, requiredCount: 1, uploadedRequiredCount: 0 },
    });
  });

  it('rejects unauthorized, oversized, and invalid decision operations', async () => {
    const reader = createRequestContext({
      ...context,
      permissions: new Set(['entry:read']),
    });
    expect(
      (
        await decideEntryDocument(
          reader,
          {
            entryId: 'entry-a',
            documentId: 'doc-a',
            status: 'reviewed',
            reason: '',
            actor: 'admin',
          },
          { documents: repository },
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await uploadEntryDocument(
          context,
          {
            entryId: 'entry-a',
            typeKey: 'license',
            fileName: 'license.pdf',
            contentType: 'application/pdf',
            body: new Uint8Array(ENTRY_DOCUMENT_MAX_BYTES + 1),
            actor: 'admin',
          },
          { documents: repository, storage },
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await decideEntryDocument(
          context,
          {
            entryId: 'entry-a',
            documentId: 'doc-a',
            status: 'rejected',
            reason: ' ',
            actor: 'admin',
          },
          { documents: repository },
        )
      ).ok,
    ).toBe(false);
  });
});
