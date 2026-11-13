import { and, eq } from 'drizzle-orm';
import { uploadEntryDocument, decideEntryDocument } from '@racepilot/core';
import {
  createDatabase,
  createEntryDocumentsRepository,
  entries,
  people,
} from '@racepilot/adapter-postgres';
import { createLocalObjectStorage } from '@racepilot/adapter-local-storage';
import type { rows as demoRows } from './community-demo-data.js';

type Db = Awaited<ReturnType<typeof createDatabase>>['db'];
type Context = Parameters<
  ReturnType<typeof createEntryDocumentsRepository>['listTypes']
>[0];

/** Keep the visual fixture idempotent; only the dedicated demo event receives these records. */
export async function seedDemoDocuments(
  db: Db,
  ctx: Context,
  eventId: string,
  rows: typeof demoRows,
) {
  const documents = createEntryDocumentsRepository(db);
  const configured =
    (await documents.listConfiguredTypes?.(ctx, eventId)) ??
    (await documents.listTypes(ctx, eventId));
  if (!configured.length) {
    const saved = await documents.saveTypes(
      ctx,
      eventId,
      [
        {
          key: 'fahrerlizenz',
          name: 'Fahrerlizenz',
          required: true,
          hint: null,
        },
        {
          key: 'fahrzeugschein',
          name: 'Fahrzeugschein',
          required: true,
          hint: null,
        },
      ],
      'demo-seed',
    );
    if (!saved.ok) throw new Error(`Demo document types: ${saved.reason}`);
  }
  const storageRoot = process.env.STORAGE_LOCAL_ROOT;
  if (!storageRoot) return;
  const storage = createLocalObjectStorage(storageRoot);
  const cases = [
    { name: 'Tom Probe', uploads: [{ key: 'fahrerlizenz', review: true }] },
    {
      name: 'Anna Beispiel',
      uploads: [
        { key: 'fahrerlizenz', review: false },
        { key: 'fahrzeugschein', review: false },
      ],
    },
  ];
  for (const item of cases) {
    const index = rows.findIndex((row) => row[0] === item.name);
    if (index < 0) continue;
    const email = `demo-${String(index + 1).padStart(3, '0')}@example.invalid`;
    const [person] = await db
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          eq(people.organizationId, ctx.organizationId),
          eq(people.emailNormalized, email),
        ),
      )
      .limit(1);
    if (!person) continue;
    const [entry] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(
        and(
          eq(entries.organizationId, ctx.organizationId),
          eq(entries.eventId, eventId),
          eq(entries.driverPersonId, person.id),
        ),
      )
      .limit(1);
    if (!entry) continue;
    const existing = await documents.listByEntry(ctx, entry.id);
    if (!existing.ok) throw new Error(`Demo documents: ${existing.reason}`);
    for (const upload of item.uploads) {
      if (existing.value.some((record) => record.typeKey === upload.key))
        continue;
      const result = await uploadEntryDocument(
        ctx,
        {
          entryId: entry.id,
          typeKey: upload.key,
          fileName: `${upload.key}.pdf`,
          contentType: 'application/pdf',
          body: new TextEncoder().encode(
            '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF',
          ),
          actor: 'demo-seed',
        },
        { documents, storage },
      );
      if (!result.ok) throw new Error(`Demo upload: ${result.reason}`);
      if (upload.review) {
        const reviewed = await decideEntryDocument(
          ctx,
          {
            entryId: entry.id,
            documentId: result.value.id,
            status: 'reviewed',
            reason: '',
            actor: 'demo-seed',
          },
          { documents },
        );
        if (!reviewed.ok) throw new Error(`Demo review: ${reviewed.reason}`);
      }
    }
  }
}
