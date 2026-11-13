import { z } from 'zod';
import {
  EntryDocumentDecisionRequest,
  EntryDocumentTypeSchema,
  ENTRY_DOCUMENT_MAX_BYTES,
} from '@racepilot/contracts';
import type {
  EntryDocumentErrorCode,
  ObjectStorageProvider,
} from '@racepilot/core';
import {
  decideEntryDocument,
  getEntryDocumentProjection,
  uploadEntryDocument,
  setEntryDocumentTypes,
} from '@racepilot/core';
import type { ApiRoutesContext } from './context.js';

const uuid = z.string().uuid();
const actorFor = (context: {
  subject?: { issuer: string; subject: string };
  correlationId: string;
}) =>
  context.subject
    ? `${context.subject.issuer}#${context.subject.subject}`
    : context.correlationId;
const responseFor = (error: EntryDocumentErrorCode) => {
  switch (error) {
    case 'actor_required':
    case 'decision_reason_required':
    case 'document_types_invalid':
    case 'file_content_invalid':
    case 'file_invalid':
    case 'file_metadata_invalid':
    case 'storage_tenant_mismatch':
    case 'storage_unavailable':
    case 'document_persistence_failed':
    case 'document_type_unavailable':
      return { status: 422 as const, message: error };
    case 'document_not_uploaded':
      return { status: 409 as const, message: error };
    case 'document_not_found':
    case 'entry_not_found':
    case 'event_not_found':
      return { status: 404 as const, message: 'Not found' };
    case 'entry_read_required':
    case 'entry_write_required':
      return { status: 403 as const, message: 'Forbidden' };
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
};

export function registerEntryDocumentRoutes({
  app,
  deps,
  requireMember,
}: ApiRoutesContext): void {
  app.get('/admin/events/:eventId/entry-document-types', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const eventId = uuid.safeParse(c.req.param('eventId'));
    if (!eventId.success) return c.json({ error: 'Invalid event' }, 400);
    const types = await (
      deps.entryDocuments.listConfiguredTypes ?? deps.entryDocuments.listTypes
    )(guard.context, eventId.data);
    return c.json({ items: types });
  });

  app.put('/admin/events/:eventId/entry-document-types', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const eventId = uuid.safeParse(c.req.param('eventId'));
    const parsed = z
      .object({ types: z.array(EntryDocumentTypeSchema).max(30) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (
      !eventId.success ||
      !parsed.success ||
      new Set(parsed.data?.types.map((type) => type.key)).size !==
        parsed.data?.types.length
    )
      return c.json({ error: 'Invalid request' }, 400);
    const saved = await setEntryDocumentTypes(
      guard.context,
      eventId.data,
      parsed.data.types,
      actorFor(guard.context),
      { documents: deps.entryDocuments },
    );
    if (!saved.ok) {
      const mapped = responseFor(saved.reason);
      return c.json({ error: mapped.message }, mapped.status);
    }
    return c.json({ items: saved.value });
  });

  app.get('/admin/entries/:entryId/documents', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const entryId = uuid.safeParse(c.req.param('entryId'));
    if (!entryId.success) return c.json({ error: 'Invalid entry' }, 400);
    const projection = await getEntryDocumentProjection(
      guard.context,
      entryId.data,
      { documents: deps.entryDocuments },
    );
    if (!projection.ok) {
      const mapped = responseFor(projection.reason);
      return c.json({ error: mapped.message }, mapped.status);
    }
    const entryView = await deps.entries.getById(guard.context, entryId.data);
    const dimensions = entryView?.statusProjection?.dimensions ?? [];
    const waiver = dimensions.find((item) => item.key === 'waiver');
    const payment = dimensions.find((item) => item.key === 'payment');
    const lines = [
      ...projection.value.lines,
      ...(waiver
        ? [
            {
              kind: 'waiver' as const,
              key: 'waiver' as const,
              label: waiver.label.de,
              status: waiver.value,
            },
          ]
        : []),
      ...(payment
        ? [
            {
              kind: 'payment' as const,
              key: 'payment' as const,
              label: payment.label.de,
              status: payment.value,
            },
          ]
        : []),
    ];
    return c.json({
      ...projection.value,
      lines,
    });
  });

  for (const status of ['reviewed', 'rejected'] as const)
    app.post(
      `/admin/entries/:entryId/documents/:documentId/${status}`,
      async (c) => {
        const guard = await requireMember(c.req.raw, 'entry:write');
        if (!guard.ok) return c.json({ error: guard.error }, guard.status);
        const entryId = uuid.safeParse(c.req.param('entryId'));
        const documentId = uuid.safeParse(c.req.param('documentId'));
        const parsed = EntryDocumentDecisionRequest.safeParse(
          await c.req.json().catch(() => null),
        );
        if (
          !entryId.success ||
          !documentId.success ||
          !parsed.success ||
          (status === 'rejected' && !parsed.data.reason)
        )
          return c.json({ error: 'Invalid request' }, 400);
        const result = await decideEntryDocument(
          guard.context,
          {
            entryId: entryId.data,
            documentId: documentId.data,
            status,
            reason: parsed.data.reason,
            actor: actorFor(guard.context),
          },
          { documents: deps.entryDocuments },
        );
        if (!result.ok) {
          const mapped = responseFor(result.reason);
          return c.json({ error: mapped.message }, mapped.status);
        }
        return c.json(result.value);
      },
    );
}

/** Document file download and upload; registered only with object storage. */
export function registerEntryDocumentFileRoutes(
  { app, deps, requireMember }: ApiRoutesContext,
  storage: ObjectStorageProvider,
): void {
  app.get('/admin/entries/:entryId/documents/:documentId/file', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const entryId = uuid.safeParse(c.req.param('entryId'));
    const documentId = uuid.safeParse(c.req.param('documentId'));
    if (!entryId.success || !documentId.success)
      return c.json({ error: 'Invalid document' }, 400);
    const documents = await deps.entryDocuments.listByEntry(
      guard.context,
      entryId.data,
    );
    if (!documents.ok) return c.json({ error: 'Not found' }, 404);
    const document = documents.value.find(
      (item) => item.id === documentId.data,
    );
    if (!document) return c.json({ error: 'Not found' }, 404);
    const stored = await storage.get(
      guard.context.organizationId,
      document.objectId,
    );
    if (!stored || stored.ref.sha256 !== document.sha256)
      return c.json({ error: 'Not found' }, 404);
    return new Response(Uint8Array.from(stored.body), {
      status: 200,
      headers: {
        'Content-Type': document.contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  });

  app.post('/admin/entries/:entryId/documents', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const entryId = uuid.safeParse(c.req.param('entryId'));
    if (!entryId.success) return c.json({ error: 'Invalid entry' }, 400);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    const typeKey = form?.get('typeKey');
    if (
      !(file instanceof File) ||
      typeof typeKey !== 'string' ||
      file.size > ENTRY_DOCUMENT_MAX_BYTES
    )
      return c.json({ error: 'Invalid upload' }, 422);
    const result = await uploadEntryDocument(
      guard.context,
      {
        entryId: entryId.data,
        typeKey,
        fileName: file.name,
        contentType: file.type,
        body: new Uint8Array(await file.arrayBuffer()),
        actor: actorFor(guard.context),
      },
      { documents: deps.entryDocuments, storage },
    );
    if (!result.ok) {
      const mapped = responseFor(result.reason);
      return c.json({ error: mapped.message }, mapped.status);
    }
    return c.json(result.value, 201);
  });
}
