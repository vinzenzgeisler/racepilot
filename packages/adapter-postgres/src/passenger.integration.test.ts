import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import {
  createRequestContext,
  organizationId,
  staticCanonicalOrigin,
} from '@racepilot/core';
import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createEntryRepository,
  createPassengerAdminRepository,
  createPassengerPublicRepository,
  createPublicRegistrationService,
  emailOutbox,
  entries,
  entryPassengerConsentEvidence,
  entryPassengerLinks,
  entryPassengers,
  eventClasses,
  events,
  organizations,
  vehicles,
} from './index.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
const termsText = 'Ich habe die Teilnahmebedingungen gelesen.';
const termsHash = createHash('sha256').update(termsText).digest('hex');
const origin = 'https://entries.example.test';

const person = {
  firstName: 'Anna',
  lastName: 'Rennfahrerin',
  dateOfBirth: '1990-05-05',
  email: 'anna@example.test',
};

describe.skipIf(!url)('co-driver, personal link and spare vehicle', () => {
  it('registers a co-driver with the entry, completes data through a short-lived link and keeps tenants apart', async () => {
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const seed = async (label: string) => {
        const [org] = await db
          .insert(organizations)
          .values({
            slug: `passenger-${label}-${suffix}`,
            name: `Passenger ${label}`,
            timezone: 'UTC',
            locale: 'de',
            registrationFormConfig: {
              features: {
                passenger: true,
                spareVehicle: true,
                multipleEntries: true,
              },
            },
          })
          .returning();
        const [event] = await db
          .insert(events)
          .values({
            organizationId: org!.id,
            slug: `event-${label}`,
            name: `Bergpreis ${label}`,
            startsOn: '2030-06-01',
            endsOn: '2030-06-02',
            status: 'open',
            consentTerms: [
              {
                key: 'participation',
                version: '1',
                language: 'de' as const,
                text: termsText,
                hash: termsHash,
                required: true,
              },
            ],
          })
          .returning();
        const klass = async (
          code: string,
          passengerMode: string,
          maxParticipants: number | null = null,
        ) =>
          (
            await db
              .insert(eventClasses)
              .values({
                organizationId: org!.id,
                eventId: event!.id,
                name: `Klasse ${code}`,
                code,
                vehicleType: 'car',
                passengerMode,
                maxParticipants,
              })
              .returning()
          )[0]!;
        return {
          org: org!,
          event: event!,
          optional: await klass('OPT', 'optional', 1),
          required: await klass('REQ', 'required'),
          none: await klass('NON', 'none'),
        };
      };
      const a = await seed('a');
      const b = await seed('b');
      const ctx = (tenant: string, permissions: string[] = []) =>
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(tenant),
          permissions: new Set(permissions),
          capabilities: new Set(),
          correlationId: suffix,
        });
      const canonicalOrigin = staticCanonicalOrigin(origin);
      const service = createPublicRegistrationService(db, { canonicalOrigin });
      const adminRepo = createPassengerAdminRepository(db, { canonicalOrigin });
      const publicRepo = createPassengerPublicRepository(db);
      const entryRepo = createEntryRepository(db);
      const consent = {
        key: 'participation',
        version: '1',
        hash: termsHash,
        accepted: true as const,
      };
      const submission = (
        target: typeof a,
        entriesPatch: Array<Record<string, unknown>>,
        personPatch: Record<string, unknown> = {},
      ) => ({
        submissionId: crypto.randomUUID(),
        formVersion: '1.0' as const,
        language: 'de' as const,
        eventSlug: target.event.slug,
        person: { ...person, ...personPatch },
        entries: entriesPatch.map((patch) => ({
          vehicle: {
            make: 'NSU',
            model: 'TT',
            year: 1969,
            registration: null,
          },
          ...patch,
        })),
        consents: [consent],
      }) as never;
      const adminOf = async (target: typeof a, email: string) => {
        const list = await entryRepo.listAdmin!(
          ctx(target.org.id, ['entry:read']),
          {
            page: 1,
            pageSize: 50,
            eventId: target.event.id,
            sort: 'createdAt',
            direction: 'asc',
          },
        );
        return list.items.filter(
          (item) => item.adminDetails?.driver.email === email,
        );
      };

      // A class that takes no co-driver refuses one; a required class refuses an entry without one.
      await expect(
        service.submit(
          ctx(a.org.id),
          a.event.slug,
          submission(a, [
            {
              classId: a.none.id,
              passenger: { firstName: 'Max', lastName: 'Beifahrer' },
            },
          ]),
        ),
      ).rejects.toMatchObject({ reason: 'passenger-unavailable' });
      await expect(
        service.submit(
          ctx(a.org.id),
          a.event.slug,
          submission(a, [{ classId: a.required.id }]),
        ),
      ).rejects.toMatchObject({ reason: 'passenger-required' });

      // An entry with a co-driver and a spare vehicle; the spare does not use class capacity.
      await service.submit(
        ctx(a.org.id),
        a.event.slug,
        submission(a, [
          {
            classId: a.optional.id,
            passenger: {
              firstName: 'Max',
              lastName: 'Beifahrer',
              email: 'max@example.test',
            },
            spareVehicle: {
              make: 'Fiat',
              model: 'Abarth',
              year: 1970,
              registration: 'DD-AB 1',
            },
          },
        ]),
      );
      const [entry] = await adminOf(a, person.email);
      expect(entry!.adminDetails).toMatchObject({
        passengerMode: 'optional',
        passenger: {
          firstName: 'Max',
          lastName: 'Beifahrer',
          email: 'max@example.test',
          source: 'registration',
          status: 'recorded',
          consents: [],
        },
        spareVehicle: {
          make: 'Fiat',
          model: 'Abarth',
          registration: 'DD-AB 1',
        },
      });
      expect(
        entry!.statusProjection?.hints.find((hint) => hint.key === 'passenger'),
      ).toMatchObject({ present: true });
      expect(
        await db
          .select()
          .from(entries)
          .where(eq(entries.organizationId, a.org.id)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(vehicles)
          .where(eq(vehicles.organizationId, a.org.id)),
      ).toHaveLength(2);
      // The class has capacity 1: the spare vehicle did not count, a second entry is refused.
      await expect(
        service.submit(
          ctx(a.org.id),
          a.event.slug,
          submission(a, [{ classId: a.optional.id }], {
            firstName: 'Bert',
            lastName: 'Zweiter',
            email: 'bert@example.test',
          }),
        ),
      ).rejects.toMatchObject({ reason: 'capacity-exceeded' });

      // No mail goes to the co-driver before the driver's address is verified.
      const passengerMails = () =>
        db
          .select()
          .from(emailOutbox)
          .where(
            and(
              eq(emailOutbox.organizationId, a.org.id),
              eq(emailOutbox.templateKey, 'passenger-link'),
            ),
          );
      expect(await passengerMails()).toHaveLength(0);
      const [verificationMail] = await db
        .select()
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.organizationId, a.org.id),
            eq(emailOutbox.templateKey, 'verification'),
          ),
        );
      const verifyToken = new URL(
        verificationMail!.variables.verificationUrl!,
      ).searchParams.get('token')!;
      expect(await service.verify(ctx(a.org.id), verifyToken)).toBe(true);
      const [mail] = await passengerMails();
      expect(mail).toMatchObject({
        recipient: 'max@example.test',
        locale: 'de',
      });
      expect(mail!.variables).toMatchObject({
        recipientName: 'Max Beifahrer',
        driverName: 'Anna Rennfahrerin',
        eventName: 'Bergpreis a',
      });
      const linkUrl = new URL(mail!.variables.linkUrl!);
      expect(linkUrl.origin).toBe(origin);
      expect(linkUrl.pathname).toBe('/passenger');
      const token = linkUrl.searchParams.get('token')!;

      // Only the hash is stored; the token itself is nowhere in the link table.
      const links = await db
        .select()
        .from(entryPassengerLinks)
        .where(eq(entryPassengerLinks.organizationId, a.org.id));
      expect(links).toHaveLength(1);
      expect(JSON.stringify(links)).not.toContain(token);
      expect(links[0]!.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(links[0]!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
        72 * 60 * 60 * 1000,
      );
      // Verifying again does not send a second mail.
      await service.verify(ctx(a.org.id), verifyToken);
      expect(await passengerMails()).toHaveLength(1);

      // The link opens exactly this entry's co-driver; a foreign tenant, a wrong or a malformed token see nothing.
      const view = await publicRepo.resolve(ctx(a.org.id), token);
      expect(view).toMatchObject({
        eventName: 'Bergpreis a',
        className: 'Klasse OPT',
        driverName: 'Anna R.',
        language: 'de',
        passenger: { firstName: 'Max', lastName: 'Beifahrer' },
      });
      expect(JSON.stringify(view)).not.toContain('anna@example.test');
      expect(await publicRepo.resolve(ctx(b.org.id), token)).toBeNull();
      expect(await publicRepo.resolve(ctx(a.org.id), `${token}x`)).toBeNull();
      expect(
        await publicRepo.resolve(ctx(a.org.id), 'x'.repeat(43)),
      ).toBeNull();

      // Completing needs the exact required terms, an own date of birth and an adult.
      const details = {
        firstName: 'Max',
        lastName: 'Beifahrer',
        dateOfBirth: '1988-03-03',
        country: 'DE',
        phone: '+49 351 111',
        city: 'Dresden',
      };
      const accepted = [
        { key: 'participation', version: '1', hash: termsHash },
      ];
      expect(
        await publicRepo.complete(ctx(a.org.id), token, 'de', details, []),
      ).toBe('terms_required');
      expect(
        await publicRepo.complete(ctx(a.org.id), token, 'de', details, [
          { key: 'participation', version: '1', hash: 'f'.repeat(64) },
        ]),
      ).toBe('terms_mismatch');
      expect(
        await publicRepo.complete(
          ctx(a.org.id),
          token,
          'de',
          { ...details, dateOfBirth: '2015-01-01' },
          accepted,
        ),
      ).toBe('guardian_required');
      expect(
        await publicRepo.complete(
          ctx(b.org.id),
          token,
          'de',
          details,
          accepted,
        ),
      ).toBe('unavailable');
      expect(
        await db.select().from(entryPassengerConsentEvidence),
      ).toHaveLength(0);
      expect(
        await publicRepo.complete(
          ctx(a.org.id),
          token,
          'de',
          details,
          accepted,
        ),
      ).toBe('completed');
      // The link works once.
      expect(await publicRepo.resolve(ctx(a.org.id), token)).toBeNull();
      expect(
        await publicRepo.complete(
          ctx(a.org.id),
          token,
          'de',
          details,
          accepted,
        ),
      ).toBe('unavailable');

      // The detail shows the completed co-driver with their own consent evidence.
      const [after] = await adminOf(a, person.email);
      expect(after!.adminDetails?.passenger).toMatchObject({
        status: 'completed',
        dateOfBirth: '1988-03-03',
        phone: '+49 351 111',
        city: 'Dresden',
        consents: [
          expect.objectContaining({
            key: 'participation',
            text: termsText,
            required: true,
          }),
        ],
      });
      expect(after!.adminDetails?.consents).toHaveLength(1);
      expect(after!.adminHistory?.map((item) => item.label)).toEqual(
        expect.arrayContaining(['passenger_added', 'passenger_completed']),
      );

      // Office: needs entry:write; another organization's entry does not exist for it.
      const writer = (tenant: string) =>
        ctx(tenant, ['entry:read', 'entry:write']);
      await expect(
        adminRepo.add(
          ctx(a.org.id, ['entry:read']),
          entry!.id,
          { firstName: 'X', lastName: 'Y' },
          'oidc#admin',
        ),
      ).rejects.toThrow('Forbidden');
      expect(
        await adminRepo.add(
          writer(b.org.id),
          entry!.id,
          { firstName: 'Fremd', lastName: 'Zugriff' },
          'oidc#admin',
        ),
      ).toEqual({ status: 'not_found' });
      expect(
        await adminRepo.issueLink(
          writer(b.org.id),
          entry!.id,
          { firstName: 'Fremd', lastName: 'Zugriff' },
          'oidc#admin',
        ),
      ).toEqual({ status: 'not_found' });
      expect(
        await adminRepo.add(
          writer(a.org.id),
          entry!.id,
          { firstName: 'Zweiter', lastName: 'Beifahrer' },
          'oidc#admin',
        ),
      ).toEqual({ status: 'exists' });
      expect(
        await adminRepo.issueLink(
          writer(a.org.id),
          entry!.id,
          {},
          'oidc#admin',
        ),
      ).toEqual({ status: 'completed' });

      // A later entry in a class without co-drivers: the office cannot add one; the optional class can.
      await service.submit(
        ctx(a.org.id),
        a.event.slug,
        submission(a, [{ classId: a.none.id }], {
          firstName: 'Carl',
          lastName: 'Solo',
          email: 'carl@example.test',
          dateOfBirth: '1985-01-01',
        }),
      );
      const [solo] = await adminOf(a, 'carl@example.test');
      expect(solo!.adminDetails).toMatchObject({
        passengerMode: 'none',
        passenger: null,
        spareVehicle: null,
      });
      expect(
        await adminRepo.add(
          writer(a.org.id),
          solo!.id,
          { firstName: 'Nicht', lastName: 'Vorgesehen' },
          'oidc#admin',
        ),
      ).toEqual({ status: 'unavailable' });

      // Office adds a co-driver afterwards and creates a link: names are needed first, then the link
      // is mailed to the address given, replaces older links and is handed back once.
      await db
        .update(eventClasses)
        .set({ passengerMode: 'optional', maxParticipants: null })
        .where(eq(eventClasses.id, a.none.id));
      expect(
        await adminRepo.issueLink(writer(a.org.id), solo!.id, {}, 'oidc#admin'),
      ).toEqual({ status: 'no_passenger' });
      const first = await adminRepo.issueLink(
        writer(a.org.id),
        solo!.id,
        { firstName: 'Nina', lastName: 'Nachgemeldet' },
        'oidc#admin',
      );
      expect(first).toMatchObject({ status: 'created', mailQueued: false });
      const firstToken = new URL(
        (first as { url: string }).url,
      ).searchParams.get('token')!;
      expect(await publicRepo.resolve(ctx(a.org.id), firstToken)).toMatchObject(
        { passenger: { firstName: 'Nina' } },
      );
      const second = await adminRepo.issueLink(
        writer(a.org.id),
        solo!.id,
        { email: 'nina@example.test' },
        'oidc#admin',
      );
      expect(second).toMatchObject({ status: 'created', mailQueued: true });
      expect(await publicRepo.resolve(ctx(a.org.id), firstToken)).toBeNull();
      const secondToken = new URL(
        (second as { url: string }).url,
      ).searchParams.get('token')!;
      expect(
        await publicRepo.resolve(ctx(a.org.id), secondToken),
      ).toMatchObject({ passenger: { email: 'nina@example.test' } });
      expect(
        (await adminOf(a, 'carl@example.test'))[0]!.adminDetails?.passenger,
      ).toMatchObject({ status: 'invited', firstName: 'Nina' });
      expect(await passengerMails()).toHaveLength(2);

      // An expired link is not accepted.
      await db
        .update(entryPassengerLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(entryPassengerLinks.organizationId, a.org.id));
      expect(await publicRepo.resolve(ctx(a.org.id), secondToken)).toBeNull();
      expect(
        (await adminOf(a, 'carl@example.test'))[0]!.adminDetails?.passenger,
      ).toMatchObject({ status: 'recorded' });

      // Organization B has none of this: no passengers, links, consents or mails.
      for (const table of [
        entryPassengers,
        entryPassengerLinks,
        entryPassengerConsentEvidence,
      ])
        expect(
          await db
            .select()
            .from(table)
            .where(eq(table.organizationId, b.org.id)),
        ).toEqual([]);
    } finally {
      await pool.end();
    }
  }, 60_000);
});
