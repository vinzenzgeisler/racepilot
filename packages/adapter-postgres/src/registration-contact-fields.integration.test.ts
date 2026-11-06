import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { createRequestContext, organizationId } from '@racepilot/core';
import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createEntryRepository,
  createPublicRegistrationService,
  emailOutbox,
  entries,
  eventClasses,
  events,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from './index.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
const text = (key: string) => `Wortlaut ${key}: Ich stimme zu.`;
const hash = (key: string) =>
  createHash('sha256').update(text(key)).digest('hex');
const admin = (orgId: string) =>
  createRequestContext({
    deploymentMode: 'cloud',
    organizationId: organizationId(orgId),
    permissions: new Set(['entry:read']),
    capabilities: new Set(),
    correlationId: 'fields',
  });

const person = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Anna',
  lastName: 'Rennfahrerin',
  dateOfBirth: '1990-05-05',
  email: 'anna@example.test',
  phone: '+49 351 123456',
  street: 'Musterweg 1',
  postalCode: '01067',
  city: 'Dresden',
  emergencyContactName: 'Bernd Rennfahrer',
  emergencyContactPhone: '+49 351 999',
  publicationPreference: 'initials' as const,
  ...overrides,
});
const vehicle = (overrides: Record<string, unknown> = {}) => ({
  make: 'NSU',
  model: 'TT',
  year: 1969,
  registration: null,
  displacementCc: 1177,
  cylinders: 4,
  ownerName: 'Anna Rennfahrerin',
  history: 'Neuaufbau 2019',
  ...overrides,
});

describe.skipIf(!url)('registration contact and vehicle fields', () => {
  it('carries public payloads to the admin detail, enforces the configured states and keeps events apart', async () => {
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    let orgId: string | undefined;
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `fields-${suffix}`,
          name: 'Fields',
          timezone: 'UTC',
          locale: 'de',
          // An old stored configuration that predates the newer standard fields.
          registrationFormConfig: {
            fields: { requestedStartNumber: { state: 'optional' } },
          },
        })
        .returning();
      orgId = org!.id;
      const mkEvent = async (
        slug: string,
        config: Record<string, unknown> | null,
      ) => {
        const [event] = await db
          .insert(events)
          .values({
            organizationId: orgId!,
            slug: `${slug}-${suffix}`,
            name: slug,
            startsOn: '2030-06-01',
            endsOn: '2030-06-02',
            status: 'open',
            registrationFormConfig: config,
            consentTerms: ['participation', 'photos'].map((key, index) => ({
              key,
              version: '1',
              language: 'de' as const,
              text: text(key),
              hash: hash(key),
              required: index === 0,
            })),
          })
          .returning();
        const [klass] = await db
          .insert(eventClasses)
          .values({
            organizationId: orgId!,
            eventId: event!.id,
            name: 'Klasse M',
            code: 'M',
            vehicleType: 'motorcycle',
            maxParticipants: 50,
          })
          .returning();
        return { event: event!, klass: klass! };
      };
      const open = await mkEvent('open', null);
      const strict = await mkEvent('strict', {
        fields: {
          phone: { state: 'required' },
          emergencyContact: { state: 'required' },
          city: { state: 'hidden' },
          displacement: { state: 'required' },
          history: { state: 'hidden' },
        },
      });
      const service = createPublicRegistrationService(db, {
        canonicalBaseUrl: 'https://entries.example.test',
      });
      const ctx = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(orgId),
        permissions: new Set(),
        capabilities: new Set(),
        correlationId: suffix,
      });
      const request = (
        target: typeof open,
        personPatch: Record<string, unknown> = {},
        vehiclePatch: Record<string, unknown> = {},
        extraEntries = 0,
      ) => ({
        submissionId: crypto.randomUUID(),
        formVersion: '1.0' as const,
        language: 'de' as const,
        eventSlug: target.event.slug,
        person: person(personPatch),
        entries: Array.from({ length: 1 + extraEntries }, (_, index) => ({
          classId: target.klass.id,
          vehicle: vehicle({ model: `TT ${index}`, ...vehiclePatch }),
        })),
        consents: [
          {
            key: 'participation',
            version: '1',
            hash: hash('participation'),
            accepted: true as const,
          },
          {
            key: 'photos',
            version: '1',
            hash: hash('photos'),
            accepted: true as const,
          },
        ],
      });
      const detail = async (eventId: string, email = 'anna@example.test') => {
        const result = await createEntryRepository(db).listAdmin!(
          admin(orgId!),
          {
            page: 1,
            pageSize: 50,
            eventId,
            sort: 'createdAt',
            direction: 'asc',
          },
        );
        return result.items.filter(
          (item) => item.adminDetails?.driver.email === email,
        );
      };

      // The delivered form carries the states the event configured; the old organization
      // configuration without the new keys still resolves.
      const form = await service.getForm(ctx, strict.event.slug);
      expect(form?.registrationFormConfig).toMatchObject({
        fields: {
          phone: { state: 'required' },
          requestedStartNumber: { state: 'optional' },
        },
      });

      // A complete payload reaches the admin detail unchanged; two starts keep their own data.
      await service.submit(
        ctx,
        open.event.slug,
        request(open, {}, {}, 1) as never,
      );
      const [first, second] = await detail(open.event.id);
      expect(first?.adminDetails?.driver).toMatchObject({
        phone: '+49 351 123456',
        street: 'Musterweg 1',
        postalCode: '01067',
        city: 'Dresden',
        emergencyContactName: 'Bernd Rennfahrer',
        emergencyContactPhone: '+49 351 999',
        publicationPreference: 'initials',
        registrationEntryCount: 2,
      });
      expect(first?.adminDetails?.vehicle).toMatchObject({
        displacementCc: 1177,
        cylinders: 4,
        ownerName: 'Anna Rennfahrerin',
        history: 'Neuaufbau 2019',
        // The type is not asked: it follows the class.
        vehicleType: 'motorcycle',
      });
      expect(second?.adminDetails?.vehicle).toMatchObject({ model: 'TT 1' });
      // Recorded acceptances, with the exact wording that was accepted.
      expect(first?.adminDetails?.consents).toEqual([
        expect.objectContaining({
          key: 'participation',
          version: '1',
          language: 'de',
          text: text('participation'),
          required: true,
        }),
        expect.objectContaining({
          key: 'photos',
          text: text('photos'),
          required: false,
        }),
      ]);
      expect(first?.adminDetails?.consents?.[0]?.acceptedAt).toMatch(/^20/);
      // The contact data lives on the registration, not on the organization-wide person.
      const personRows = await db
        .select()
        .from(people)
        .where(eq(people.organizationId, orgId));
      expect(Object.keys(personRows[0]!)).not.toContain('phone');
      expect(personRows).toHaveLength(1);

      const before = JSON.stringify(
        await db
          .select()
          .from(registrationGroups)
          .where(eq(registrationGroups.eventId, open.event.id)),
      );
      const entriesBefore = (
        await db.select().from(entries).where(eq(entries.organizationId, orgId))
      ).length;

      // Required, hidden and invalid: refused as a whole, nothing is stored.
      const refusals: Array<[string, ReturnType<typeof request>]> = [
        [
          'phone required but missing',
          request(strict, { phone: null, city: null, history: null } as never),
        ],
        [
          'emergency contact required but incomplete',
          request(strict, {
            emergencyContactPhone: null,
            city: null,
            history: null,
          }),
        ],
        [
          'displacement required but missing',
          request(
            strict,
            { city: null },
            { displacementCc: null, history: null },
          ),
        ],
        ['city hidden but given', request(strict, {}, { history: null })],
        ['history hidden but given', request(strict, { city: null })],
        [
          'emergency contact given in halves on an open form',
          request(open, { emergencyContactPhone: null }),
        ],
      ];
      for (const [label, payload] of refusals)
        await expect(
          service.submit(ctx, payload.eventSlug, payload as never),
          label,
        ).rejects.toThrow('Registration unavailable');
      expect(
        (
          await db
            .select()
            .from(entries)
            .where(eq(entries.organizationId, orgId))
        ).length,
      ).toBe(entriesBefore);

      // The strict event accepts exactly what it asks for; hidden fields stay empty.
      await service.submit(
        ctx,
        strict.event.slug,
        request(
          strict,
          { city: null, phone: '+49 777 0000', emergencyContactName: 'Carla' },
          { history: null },
        ) as never,
      );
      const [strictEntry] = await detail(strict.event.id);
      expect(strictEntry?.adminDetails?.driver).toMatchObject({
        phone: '+49 777 0000',
        emergencyContactName: 'Carla',
        city: null,
      });
      expect(strictEntry?.adminDetails?.vehicle).toMatchObject({
        displacementCc: 1177,
        history: null,
      });

      // The same person in a second event: her own data per registration, nothing leaks over.
      expect((await detail(strict.event.id, 'anna@example.test')).length).toBe(
        1,
      );
      expect(
        JSON.stringify(
          await db
            .select()
            .from(registrationGroups)
            .where(eq(registrationGroups.eventId, open.event.id)),
        ),
      ).toBe(before);
      expect(
        (await db.select().from(people).where(eq(people.organizationId, orgId)))
          .length,
      ).toBe(1);
      expect(
        (await detail(open.event.id))[0]?.adminDetails?.driver,
      ).toMatchObject({ phone: '+49 351 123456', city: 'Dresden' });
      const vehicleRows = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.organizationId, orgId));
      expect(vehicleRows).toHaveLength(3);

      // Saving and resuming keeps the new draft fields untouched.
      const draft = {
        firstName: 'Anna',
        lastName: 'Rennfahrerin',
        email: 'draft@example.test',
        dateOfBirth: '1990-05-05',
        guardianName: '',
        guardianEmail: '',
        phone: '+49 351 123456',
        street: 'Musterweg 1',
        postalCode: '01067',
        city: 'Dresden',
        emergencyContactName: 'Bernd',
        emergencyContactPhone: '+49 351 999',
        publicationPreference: 'hidden',
        vehicles: [
          {
            classId: open.klass.id,
            make: 'NSU',
            model: 'TT',
            year: '1969',
            registration: '',
            requestedStartNumber: '',
            displacementCc: '1177',
            cylinders: '4',
            ownerName: 'Anna',
            history: 'Neuaufbau',
          },
        ],
        accepted: {},
        customAnswers: {},
      };
      await service.saveDraft(
        ctx,
        open.event.slug,
        draft.email,
        'de',
        draft as never,
      );
      const message = (
        await db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.recipient, draft.email))
      )[0]!;
      const token = new URL(message.variables.resumeUrl!).hash.slice(
        '#token='.length,
      );
      const resumed = await service.resumeDraft(ctx, token);
      expect(resumed?.draft).toMatchObject({
        phone: '+49 351 123456',
        publicationPreference: 'hidden',
        vehicles: [{ displacementCc: '1177', history: 'Neuaufbau' }],
      });
    } finally {
      if (orgId) {
        const mails = await db
          .select({ id: emailOutbox.id })
          .from(emailOutbox)
          .where(eq(emailOutbox.organizationId, orgId));
        for (const mail of mails)
          await db.execute(
            sql`select graphile_worker.remove_job(${`mail-outbox:${mail.id}`})`,
          );
        await db
          .delete(emailOutbox)
          .where(eq(emailOutbox.organizationId, orgId));
        await db.delete(events).where(eq(events.organizationId, orgId));
        await db.delete(organizations).where(eq(organizations.id, orgId));
      }
      await pool.end();
    }
  });
});
