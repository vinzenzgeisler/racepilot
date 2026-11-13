import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultRegistrationFormConfig } from '@racepilot/contracts';
import {
  createDatabase,
  emailOutbox,
  events,
  getOrganizationMailConfiguration,
  invoicePayments,
  invoices,
  messageCampaigns,
  migrate,
  organizations,
  registrationGroups,
  type Database,
} from '@racepilot/adapter-postgres';
import {
  createRequestContext,
  organizationId,
  permissionsForRole,
  type ObjectStorageProvider,
  type RequestContext,
} from '@racepilot/core';
import { createProductApi } from './product.js';
import type { ContextResolvers } from './types.js';

const databaseUrl = process.env.RACEPILOT_TEST_DATABASE_URL;
const remote = { incoming: { socket: { remoteAddress: '203.0.113.7' } } };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

type CallInit = { form?: FormData; headers?: Record<string, string> };
const idempotent = (key: string): CallInit => ({
  headers: { 'idempotency-key': key },
});
const licenseForm = () => {
  const form = new FormData();
  form.set('typeKey', 'license');
  form.set(
    'file',
    new File([new TextEncoder().encode('%PDF-1.4 license')], 'license.pdf', {
      type: 'application/pdf',
    }),
  );
  return form;
};

type Tenant = { id: string; name: string; origin: string; slug: string };
type Reply = { status: number; body: unknown };

function memoryStorage(): ObjectStorageProvider {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    put: async ({ organizationId: org, body, contentType }) => {
      const objectId = crypto.randomUUID();
      objects.set(`${org}/${objectId}`, { body, contentType });
      return {
        organizationId: org,
        objectId,
        contentType,
        size: body.byteLength,
        sha256: sha(Buffer.from(body).toString('latin1')),
      };
    },
    get: async (org, objectId) => {
      const stored = objects.get(`${org}/${objectId}`);
      return stored
        ? {
            ref: {
              organizationId: org,
              objectId,
              contentType: stored.contentType,
              size: stored.body.byteLength,
              sha256: sha(Buffer.from(stored.body).toString('latin1')),
            },
            body: stored.body,
          }
        : null;
    },
    delete: async (org, objectId) => {
      objects.delete(`${org}/${objectId}`);
    },
  };
}

describe.skipIf(!databaseUrl)(
  'product composition with two organizations',
  { timeout: 120_000 },
  () => {
    let db: Database;
    let end: () => Promise<void>;
    let app: Hono;
    let tenants: { a: Tenant; b: Tenant };

    const call = async (
      tenant: Tenant | null,
      method: string,
      path: string,
      body?: unknown,
      init: CallInit = {},
    ): Promise<Reply> => {
      const headers: Record<string, string> = {
        ...(tenant ? { 'x-test-tenant': tenant.id } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      };
      const response = await app.request(
        path,
        {
          method,
          headers,
          ...(init.form
            ? { body: init.form }
            : body !== undefined
              ? { body: JSON.stringify(body) }
              : {}),
        },
        remote,
      );
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* binary or text body */
      }
      return { status: response.status, body: parsed };
    };

    beforeAll(async () => {
      const url = databaseUrl ?? '';
      await migrate(url);
      await runMigrations({ connectionString: url });
      const created = await createDatabase(url);
      db = created.db;
      end = () => created.pool.end();
      const suffix = crypto.randomUUID().slice(0, 8);
      const make = async (key: 'a' | 'b'): Promise<Tenant> => {
        const slug = `two-${key}-${suffix}`;
        const [row] = await db
          .insert(organizations)
          .values({
            slug,
            name: `Organization ${key.toUpperCase()} ${suffix}`,
            timezone: 'UTC',
            locale: 'en',
            currency: 'EUR',
            // Only organization A has a mail identity: mail.delivery differs per organization.
            ...(key === 'a' ? { mailFrom: 'club-a@example.test' } : {}),
          })
          .returning();
        if (!row) throw new Error('Organization insert failed');
        return {
          id: row.id,
          name: row.name,
          slug,
          origin: `https://${key}-${suffix}.example.test`,
        };
      };
      tenants = { a: await make('a'), b: await make('b') };
      const byId = new Map(
        [tenants.a, tenants.b].map((tenant) => [tenant.id, tenant]),
      );
      const resolve =
        (member: boolean) =>
        async (request: Request): Promise<RequestContext | null> => {
          const id = request.headers.get('x-test-tenant');
          if (!id || !byId.has(id)) return null;
          return createRequestContext({
            deploymentMode: 'cloud',
            organizationId: organizationId(id),
            ...(member
              ? {
                  subject: {
                    issuer: 'https://id.test',
                    subject: `admin-${id}`,
                  },
                }
              : {}),
            permissions: member
              ? new Set([...permissionsForRole('admin'), 'role:admin'])
              : new Set(),
            capabilities: new Set(),
            correlationId: crypto.randomUUID(),
          });
        };
      const contexts: ContextResolvers = {
        public: resolve(false),
        member: resolve(true),
      };
      app = createProductApi({
        db,
        edition: { deploymentMode: 'cloud', contexts },
        objectStorage: memoryStorage(),
        canonicalOrigin: async (tenant) =>
          byId.get(tenant.organizationId)?.origin ?? null,
        mail: {
          configuration: (tenant) =>
            getOrganizationMailConfiguration(db, tenant.organizationId),
        },
      });
    });

    afterAll(async () => {
      if (!db) return;
      try {
        if (tenants) {
          const ids = [tenants.a.id, tenants.b.id];
          await db
            .delete(messageCampaigns)
            .where(inArray(messageCampaigns.organizationId, ids));
          await db
            .delete(emailOutbox)
            .where(inArray(emailOutbox.organizationId, ids));
          await db.delete(events).where(inArray(events.organizationId, ids));
          await db.delete(organizations).where(inArray(organizations.id, ids));
        }
      } finally {
        await end();
      }
    });

    const obj = (value: unknown): Record<string, unknown> =>
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};
    const text = (value: unknown): string =>
      typeof value === 'string' ? value : '';
    const expectStatus = (reply: Reply, status: number) => {
      expect(reply.status, JSON.stringify(reply.body)).toBe(status);
      return obj(reply.body);
    };

    type Seed = {
      eventId: string;
      slug: string;
      classId: string;
      entryId: string;
      groupId: string;
      documentId: string;
      invoiceId: string;
      paymentId: string;
      campaignId: string;
      exportJobId: string;
      confirmationJobId: string;
    };
    let seed: Seed;
    const termText = 'Teilnahmebedingungen';

    /** Organization A gets a complete event with an entry, document, payment, message and exports. */
    const seedOrganizationA = async (slug: string): Promise<Seed> => {
      const a = tenants.a;
      const setup = expectStatus(
        await call(a, 'POST', '/admin/events/setup', {
          event: {
            slug,
            name: 'Rallye A',
            startsOn: '2031-06-01',
            endsOn: '2031-06-02',
          },
          classes: [
            {
              name: 'GT',
              code: 'GT',
              vehicleType: 'car',
              price: {
                baseCents: 5000,
                additionalEntryAdjustmentCents: 0,
                earlyBirdDeadline: null,
                earlyBirdDiscountCents: 0,
              },
            },
          ],
          terms: [
            {
              key: 'participation',
              version: '1',
              language: 'de',
              text: termText,
              hash: sha(termText),
              required: true,
            },
          ],
        }),
        201,
      );
      const eventId = text(setup.id);
      expectStatus(
        await call(a, 'POST', `/admin/events/${eventId}/transitions`, {
          status: 'open',
        }),
        200,
      );
      const classes = (await call(a, 'GET', `/admin/events/${eventId}/classes`))
        .body as Array<{ id: string }>;
      const classId = classes[0]?.id ?? '';
      expectStatus(
        await call(
          a,
          'POST',
          `/public/organizations/${a.id}/events/${slug}/registration/submissions`,
          {
            submissionId: crypto.randomUUID(),
            formVersion: '1.0',
            language: 'de',
            eventSlug: slug,
            person: {
              firstName: 'Ada',
              lastName: `Fahrerin-${slug}`,
              email: `ada+${slug}@example.test`,
              dateOfBirth: '1990-01-01',
            },
            entries: [
              {
                classId,
                vehicle: {
                  make: 'Porsche',
                  model: '911',
                  year: 1990,
                  registration: null,
                },
              },
            ],
            consents: [
              {
                key: 'participation',
                version: '1',
                hash: sha(termText),
                accepted: true,
              },
            ],
          },
        ),
        202,
      );
      const list = expectStatus(
        await call(a, 'GET', `/admin/entries?eventId=${eventId}`),
        200,
      );
      const entryId = text(obj((list.items as unknown[])[0]).id);
      const [group] = await db
        .select()
        .from(registrationGroups)

        .where(
          and(
            eq(registrationGroups.organizationId, a.id),
            eq(registrationGroups.eventId, eventId),
          ),
        );
      const groupId = group?.id ?? '';
      expectStatus(
        await call(a, 'PUT', `/admin/events/${eventId}/entry-document-types`, {
          types: [
            { key: 'license', name: 'License', required: true, hint: null },
          ],
        }),
        200,
      );
      const uploaded = expectStatus(
        await call(
          a,
          'POST',
          `/admin/entries/${entryId}/documents`,
          undefined,
          {
            form: licenseForm(),
          },
        ),
        201,
      );
      expectStatus(
        await call(a, 'PUT', '/admin/organization/payment-recipient', {
          accountName: 'Club A',
          iban: 'DE89370400440532013000',
        }),
        200,
      );
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, a.id),
            eq(invoices.registrationGroupId, groupId),
          ),
        );
      const invoiceId = invoice?.id ?? '';
      const payment = expectStatus(
        await call(a, 'POST', `/admin/invoices/${invoiceId}/payments`, {
          amountCents: 1000,
          reason: 'Cash at registration',
        }),
        201,
      );
      const campaign = expectStatus(
        await call(
          a,
          'POST',
          `/admin/events/${eventId}/messages/campaigns`,
          {
            eventId,
            recipients: {},
            subject: 'Welcome A',
            text: 'Hello from A',
            attachments: [],
          },
          idempotent(`campaign-key-a-1-${slug}`),
        ),
        202,
      );
      const exported = expectStatus(
        await call(
          a,
          'POST',
          `/admin/events/${eventId}/entries.csv`,
          undefined,
          idempotent(`export-key-a-1-${slug}`),
        ),
        202,
      );
      const confirmation = expectStatus(
        await call(
          a,
          'POST',
          `/admin/events/${eventId}/registration-groups/${groupId}/confirmation`,
          undefined,
          idempotent(`confirmation-key-a-1-${slug}`),
        ),
        202,
      );
      return {
        eventId,
        slug,
        classId,
        entryId,
        groupId,
        documentId: text(uploaded.id),
        invoiceId,
        paymentId: text(obj(payment.payment).id || payment.id),
        campaignId: text(campaign.id),
        exportJobId: text(exported.jobId),
        confirmationJobId: text(confirmation.jobId),
      };
    };

    /** Everything an admin of organization A can read about the seeded data. */
    const snapshotOfA = async () => {
      const a = tenants.a;
      const read = async (path: string) => (await call(a, 'GET', path)).body;
      const { eventId, entryId } = seed;
      return {
        event: await read(`/admin/events/${eventId}`),
        classes: await read(`/admin/events/${eventId}/classes`),
        pricing: await read(`/admin/events/${eventId}/pricing`),
        entry: await read(`/admin/entries/${entryId}`),
        entries: await read(`/admin/entries?eventId=${eventId}`),
        counts: await read(`/admin/events/${eventId}/entry-counts`),
        documents: await read(`/admin/entries/${entryId}/documents`),
        overview: await read(`/admin/events/${eventId}/overview`),
        campaigns: await read(`/admin/events/${eventId}/messages/campaigns`),
        exports: await read(`/admin/events/${eventId}/exports`),
        recipient: await read('/admin/organization/payment-recipient'),
        invoices: await db
          .select()
          .from(invoices)
          .where(eq(invoices.organizationId, a.id)),
        payments: await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.organizationId, a.id)),
        mail: (
          await db
            .select()
            .from(emailOutbox)
            .where(eq(emailOutbox.organizationId, a.id))
        ).map((row) => [row.id, row.status, row.attempts]),
      };
    };

    type Probe = {
      name: string;
      method: string;
      path: string;
      body?: unknown;
      init?: CallInit;
      /** `404`: not found for B. `denied`: rejected as forbidden or not found. Otherwise the empty answer B gets. */
      expect: 404 | 'denied' | { status: 200; body: unknown };
      /** The owner also gets 404 because nothing is configured or queued yet. */
      ownerNotFound?: true;
    };
    const foreignProbes = (): Probe[] => {
      const { eventId, classId, entryId, groupId, documentId, invoiceId } =
        seed;
      const { paymentId, campaignId, exportJobId, confirmationJobId } = seed;
      const event = `/admin/events/${eventId}`;
      const entry = `/admin/entries/${entryId}`;
      const filter = {
        classIds: [],
        statuses: [],
        payment: 'any',
        entryIds: [],
        additionalAddresses: [],
      };
      const price = {
        baseCents: 1,
        additionalEntryAdjustmentCents: 0,
        earlyBirdDeadline: null,
        earlyBirdDiscountCents: 0,
      };
      const nf = 404 as const;
      return [
        { name: 'event detail', method: 'GET', path: event, expect: nf },
        {
          name: 'event update',
          method: 'PATCH',
          path: event,
          body: { name: 'Hijacked' },
          expect: nf,
        },
        {
          name: 'event close',
          method: 'POST',
          path: `${event}/transitions`,
          body: { status: 'closed' },
          expect: nf,
        },
        {
          name: 'event overview',
          method: 'GET',
          path: `${event}/overview`,
          expect: nf,
        },
        {
          name: 'entry counts',
          method: 'GET',
          path: `${event}/entry-counts`,
          expect: { status: 200, body: { total: 0, statuses: {} } },
        },
        {
          name: 'class list',
          method: 'GET',
          path: `${event}/classes`,
          expect: { status: 200, body: [] },
        },
        {
          name: 'class create',
          method: 'POST',
          path: `${event}/classes`,
          body: {
            name: 'X',
            code: 'X',
            vehicleType: 'car',
            sortOrder: 0,
            maxParticipants: null,
            closed: false,
          },
          expect: 'denied' as const,
        },
        {
          name: 'class update',
          method: 'PATCH',
          path: `${event}/classes/${classId}`,
          body: { name: 'Hijacked' },
          expect: nf,
        },
        {
          name: 'pricing list',
          method: 'GET',
          path: `${event}/pricing`,
          expect: { status: 200, body: [] },
        },
        {
          name: 'consents read',
          method: 'GET',
          path: `${event}/consents`,
          expect: nf,
        },
        {
          name: 'form config read',
          method: 'GET',
          path: `${event}/registration-form-config`,
          expect: nf,
          ownerNotFound: true,
        },
        {
          name: 'form config write',
          method: 'PUT',
          path: `${event}/registration-form-config`,
          body: defaultRegistrationFormConfig,
          expect: nf,
        },
        {
          name: 'workflow read',
          method: 'GET',
          path: `${event}/registration-workflow`,
          expect: nf,
        },
        {
          name: 'status dimensions read',
          method: 'GET',
          path: `${event}/status-dimensions`,
          expect: nf,
        },
        {
          name: 'document types read',
          method: 'GET',
          path: `${event}/entry-document-types`,
          expect: { status: 200, body: { items: [] } },
        },
        {
          name: 'document types write',
          method: 'PUT',
          path: `${event}/entry-document-types`,
          body: { types: [] },
          expect: nf,
        },
        {
          name: 'exports list',
          method: 'GET',
          path: `${event}/exports`,
          expect: nf,
        },
        {
          name: 'export enqueue (GET)',
          method: 'GET',
          path: `${event}/entries.csv`,
          init: idempotent('b-export-1'),
          expect: nf,
        },
        {
          name: 'export enqueue (POST)',
          method: 'POST',
          path: `${event}/entries.csv`,
          init: idempotent('b-export-2'),
          expect: nf,
        },
        {
          name: 'confirmation enqueue',
          method: 'POST',
          path: `${event}/registration-groups/${groupId}/confirmation`,
          init: idempotent('b-confirmation-1'),
          expect: nf,
        },
        {
          name: 'entry list by foreign event',
          method: 'GET',
          path: `/admin/entries?eventId=${eventId}`,
          expect: { status: 200, body: { items: [], total: 0 } },
        },
        { name: 'entry detail', method: 'GET', path: entry, expect: nf },
        {
          name: 'entry delete action',
          method: 'POST',
          path: `${entry}/actions`,
          body: { kind: 'delete', reason: 'x', expectedVersion: 1 },
          expect: nf,
        },
        {
          name: 'entry note action',
          method: 'POST',
          path: `${entry}/actions`,
          body: { kind: 'note', visibility: 'internal', text: 'x' },
          expect: nf,
        },
        {
          name: 'entry transition',
          method: 'POST',
          path: `${entry}/transitions`,
          body: { transition: 'acceptance', status: 'accepted', reason: 'x' },
          expect: nf,
        },
        {
          name: 'entry status hints',
          method: 'PUT',
          path: `${entry}/status-hints`,
          body: { hints: { late_entry: true }, reason: 'x' },
          expect: nf,
        },
        {
          name: 'entry dimension transition',
          method: 'POST',
          path: `${entry}/status-dimensions/waiver/transitions`,
          body: { status: 'signed', reason: 'x' },
          expect: nf,
        },
        {
          name: 'entry messages',
          method: 'GET',
          path: `${entry}/messages`,
          expect: nf,
        },
        {
          name: 'driver update',
          method: 'PATCH',
          path: `${entry}/driver`,
          body: { firstName: 'Mallory' },
          expect: nf,
        },
        {
          name: 'vehicle update',
          method: 'PATCH',
          path: `${entry}/vehicle`,
          body: { make: 'Mallory' },
          expect: nf,
        },
        {
          name: 'documents list',
          method: 'GET',
          path: `${entry}/documents`,
          expect: nf,
        },
        {
          name: 'document upload',
          method: 'POST',
          path: `${entry}/documents`,
          init: { form: licenseForm() },
          expect: nf,
        },
        {
          name: 'document download',
          method: 'GET',
          path: `${entry}/documents/${documentId}/file`,
          expect: nf,
        },
        {
          name: 'document review',
          method: 'POST',
          path: `${entry}/documents/${documentId}/reviewed`,
          body: { reason: '' },
          expect: nf,
        },
        {
          name: 'document reject',
          method: 'POST',
          path: `${entry}/documents/${documentId}/rejected`,
          body: { reason: 'x' },
          expect: nf,
        },
        {
          name: 'payment record',
          method: 'POST',
          path: `/admin/invoices/${invoiceId}/payments`,
          body: { amountCents: 1, reason: 'x' },
          expect: nf,
        },
        {
          name: 'payment correction',
          method: 'POST',
          path: `/admin/payments/${paymentId}/corrections`,
          body: { reason: 'x' },
          expect: nf,
        },
        {
          name: 'message recipients preview',
          method: 'POST',
          path: `${event}/messages/recipients/preview`,
          body: filter,
          expect: nf,
        },
        {
          name: 'message templates read',
          method: 'GET',
          path: `${event}/messages/templates`,
          expect: nf,
        },
        {
          name: 'message template preview',
          method: 'POST',
          path: `${event}/messages/templates/preview`,
          body: { recipients: filter, subject: 's', text: 't' },
          expect: nf,
        },
        {
          name: 'message campaigns list',
          method: 'GET',
          path: `${event}/messages/campaigns`,
          expect: nf,
        },
        {
          name: 'message campaign send',
          method: 'POST',
          path: `${event}/messages/campaigns`,
          body: {
            eventId,
            recipients: filter,
            subject: 's',
            text: 't',
            attachments: [],
          },
          init: idempotent('b-campaign-1'),
          expect: nf,
        },
        {
          name: 'message quick action',
          method: 'POST',
          path: `${event}/messages/actions/resend-verification`,
          expect: nf,
        },
        {
          name: 'message campaign retry',
          method: 'POST',
          path: `/admin/message-campaigns/${campaignId}/retry`,
          expect: nf,
          ownerNotFound: true,
        },
        {
          name: 'export job status',
          method: 'GET',
          path: `/admin/artifact-jobs/${exportJobId}/status`,
          expect: nf,
        },
        {
          name: 'export job download',
          method: 'GET',
          path: `/admin/artifact-jobs/${exportJobId}/download`,
          expect: nf,
        },
        {
          name: 'export job artifact',
          method: 'GET',
          path: `/admin/artifact-jobs/${exportJobId}`,
          expect: nf,
        },
        {
          name: 'confirmation job status',
          method: 'GET',
          path: `/admin/artifact-jobs/${confirmationJobId}/status`,
          expect: nf,
        },
        {
          name: 'pricing update',
          method: 'PUT',
          path: `${event}/pricing/${classId}`,
          body: price,
          expect: 'denied' as const,
        },
      ];
    };

    it('resolves canonical origin and mail delivery per organization', async () => {
      seed = await seedOrganizationA('rallye');
      const a = await call(tenants.a, 'GET', '/runtime/bootstrap');
      const b = await call(tenants.b, 'GET', '/runtime/bootstrap');
      expect(obj(a.body).organization).toMatchObject({ id: tenants.a.id });
      expect(obj(b.body).organization).toMatchObject({ id: tenants.b.id });
      expect(obj(a.body).capabilities).toContain('mail.delivery');
      expect(obj(b.body).capabilities).not.toContain('mail.delivery');
      expect((await call(null, 'GET', '/runtime/bootstrap')).status).toBe(404);
      const outbox = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, tenants.a.id));
      const links = outbox
        .map((row) => text(obj(row.variables).verificationUrl))
        .filter(Boolean);
      expect(links.length).toBeGreaterThan(0);
      for (const link of links)
        expect(link.startsWith(`${tenants.a.origin}/`)).toBe(true);
    });

    it('answers every foreign-ID request of organization B without data and changes nothing', async () => {
      const before = await snapshotOfA();
      for (const probe of foreignProbes()) {
        const reply = await call(
          tenants.b,
          probe.method,
          probe.path,
          probe.body,
          probe.init,
        );
        const label = `${probe.method} ${probe.name}`;
        if (probe.expect === 'denied') {
          expect([403, 404], label).toContain(reply.status);
        } else if (probe.expect === 404) {
          expect(reply.status, `${label}: ${JSON.stringify(reply.body)}`).toBe(
            404,
          );
        } else {
          expect(reply.status, label).toBe(probe.expect.status);
          expect(reply.body, label).toMatchObject(probe.expect.body as object);
        }
        expect(JSON.stringify(reply.body), label).not.toContain(seed.eventId);
        expect(JSON.stringify(reply.body), label).not.toContain(
          'ada@example.test',
        );
      }
      expect(await snapshotOfA()).toEqual(before);
    });

    it('keeps lists, counters and organization settings of B separate from A', async () => {
      const b = tenants.b;
      expect((await call(b, 'GET', '/admin/events')).body).toEqual([]);
      expect(await call(b, 'GET', '/admin/entries')).toMatchObject({
        status: 200,
        body: { items: [], total: 0 },
      });
      expect((await call(b, 'GET', '/admin/organization')).body).toMatchObject({
        id: b.id,
        name: b.name,
      });
      expect(
        (await call(b, 'GET', '/admin/organization/payment-recipient')).body,
      ).toEqual({ recipient: null });
      const aOrganization = await call(tenants.a, 'GET', '/admin/organization');
      expect(aOrganization.body).toMatchObject({ id: tenants.a.id });
      expect(
        (await call(tenants.a, 'GET', '/admin/organization/payment-recipient'))
          .body,
      ).toMatchObject({ recipient: { accountName: 'Club A' } });
    });

    it('scopes public routes and slugs to the organization of the host', async () => {
      const { slug } = seed;
      const a = tenants.a;
      const b = tenants.b;
      // B asks for A's organization or event through its own host.
      expect(
        (await call(b, 'GET', `/public/events/${a.id}/${slug}`)).status,
      ).toBe(404);
      expect(
        (
          await call(
            b,
            'GET',
            `/public/organizations/${a.id}/events/${slug}/registration/form`,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await call(
            b,
            'GET',
            `/public/organizations/${b.id}/events/${slug}/registration/form`,
          )
        ).status,
      ).toBe(404);
      // The same slug in B is B's own event and shows nothing of A.
      expectStatus(
        await call(b, 'POST', '/admin/events/setup', {
          event: {
            slug,
            name: 'Rallye B',
            startsOn: '2031-07-01',
            endsOn: '2031-07-02',
          },
          classes: [
            {
              name: 'B-Klasse',
              code: 'B',
              vehicleType: 'car',
              price: {
                baseCents: 100,
                additionalEntryAdjustmentCents: 0,
                earlyBirdDeadline: null,
                earlyBirdDiscountCents: 0,
              },
            },
          ],
          terms: [
            {
              key: 'participation',
              version: '1',
              language: 'de',
              text: termText,
              hash: sha(termText),
              required: true,
            },
          ],
        }),
        201,
      );
      const eventB = obj(
        (await call(b, 'GET', '/admin/events')).body instanceof Array
          ? ((await call(b, 'GET', '/admin/events')).body as unknown[])[0]
          : {},
      );
      expectStatus(
        await call(b, 'POST', `/admin/events/${text(eventB.id)}/transitions`, {
          status: 'open',
        }),
        200,
      );
      const publicB = await call(b, 'GET', `/public/events/${b.id}/${slug}`);
      expect(publicB.status).toBe(200);
      expect(JSON.stringify(publicB.body)).toContain('Rallye B');
      expect(JSON.stringify(publicB.body)).not.toContain('Rallye A');
      expect(
        (await call(b, 'GET', `/public/events/${a.id}/${slug}`)).status,
      ).toBe(404);
      expect(
        JSON.stringify(
          (await call(a, 'GET', `/public/events/${a.id}/${slug}`)).body,
        ),
      ).toContain('Rallye A');
    });

    it('accepts the same requests from the owning organization (positive control)', async () => {
      // A second event of A, so mutating probes cannot disturb the data checked above.
      const control = await seedOrganizationA('rallye-control');
      const previous = seed;
      seed = control;
      try {
        const failures: string[] = [];
        const probes = foreignProbes();
        // Reads first, destructive probes last: they change what later probes see.
        const last = ['document types write', 'entry delete action'];
        const rank = (probe: Probe) =>
          probe.method === 'GET'
            ? 0
            : last.includes(probe.name)
              ? 1 + last.indexOf(probe.name) + 1
              : 1;
        for (const probe of [...probes].sort((x, y) => rank(x) - rank(y))) {
          const reply = await call(
            tenants.a,
            probe.method,
            probe.path,
            probe.body,
            probe.init,
          );
          const label = `${probe.method} ${probe.name} as owner`;
          const notFoundOk =
            probe.ownerNotFound === true && reply.status === 404;
          if ([403, 404].includes(reply.status) && !notFoundOk)
            failures.push(
              `${reply.status} ${label}: ${JSON.stringify(reply.body)}`,
            );
        }
        expect(failures).toEqual([]);
      } finally {
        seed = previous;
      }
    });
  },
);
