import { eq, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import {
  createPaymentReference,
  createRequestContext,
  organizationId,
} from '@racepilot/core';
import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createEntryDetailRepository,
  createEntryRepository,
  createInvoicePaymentRepository,
  emailOutbox,
  enqueueMailOutbox,
  entries,
  entryDataAuditEvents,
  eventClasses,
  events,
  invoices,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from './index.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;

describe.skipIf(!url)('entry detail maintenance', () => {
  it('edits within the entry context, audits it and lists mail and payment state per tenant', async () => {
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    const orgIds: string[] = [];
    const mailIds: string[] = [];
    try {
      const seed = async (label: string) => {
        const [org] = await db
          .insert(organizations)
          .values({
            slug: `detail-${label}-${suffix}`,
            name: `Detail ${label}`,
            timezone: 'UTC',
            locale: 'de',
          })
          .returning();
        orgIds.push(org!.id);
        const [event] = await db
          .insert(events)
          .values({
            organizationId: org!.id,
            slug: 'event',
            name: 'Bergpreis',
            startsOn: '2030-01-01',
            endsOn: '2030-01-01',
          })
          .returning();
        const [klass] = await db
          .insert(eventClasses)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            name: 'Touring',
            code: 'TOUR',
            vehicleType: 'car',
          })
          .returning();
        const [driver] = await db
          .insert(people)
          .values({
            organizationId: org!.id,
            firstName: 'Hans Peter',
            lastName: 'von Berg',
            email: `tom-${label}@example.test`,
          })
          .returning();
        const [vehicle] = await db
          .insert(vehicles)
          .values({ organizationId: org!.id, make: 'Honda', model: 'RS 250' })
          .returning();
        const [group] = await db
          .insert(registrationGroups)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            personId: driver!.id,
          })
          .returning();
        const [entry] = await db
          .insert(entries)
          .values({
            orgaCode: `TEST-${crypto.randomUUID()}`,
            organizationId: org!.id,
            eventId: event!.id,
            classId: klass!.id,
            registrationGroupId: group!.id,
            driverPersonId: driver!.id,
            vehicleId: vehicle!.id,
            requestedStartNumber: label === 'a' ? '42' : '43',
          })
          .returning();
        return {
          org: org!,
          event: event!,
          klass: klass!,
          driver: driver!,
          vehicle: vehicle!,
          group: group!,
          entry: entry!,
        };
      };
      const a = await seed('a');
      const b = await seed('b');
      const ctx = (tenant: string, permissions: string[]) =>
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(tenant),
          permissions: new Set(permissions),
          capabilities: new Set(),
          correlationId: suffix,
        });
      const admin = (tenant: string) =>
        ctx(tenant, ['entry:read', 'entry:write']);
      const detail = createEntryDetailRepository(db);
      const entryRepo = createEntryRepository(db);

      expect(
        await detail.updateDriver(
          admin(a.org.id),
          a.entry.id,
          { phone: '+49 1', city: 'Dresden', publicationPreference: 'hidden' },
          'oidc#admin',
        ),
      ).toBe('updated');
      // Re-sending the same values is a no-op and leaves no audit trace.
      await detail.updateDriver(
        admin(a.org.id),
        a.entry.id,
        { phone: '+49 1' },
        'oidc#admin',
      );
      await detail.updateVehicle(
        admin(a.org.id),
        a.entry.id,
        { displacementCc: 249, cylinders: 2, ownerName: 'Tom Probe' },
        'oidc#admin',
      );
      const audits = await db
        .select()
        .from(entryDataAuditEvents)
        .where(eq(entryDataAuditEvents.entryId, a.entry.id));
      expect(audits.map((row) => row.subject).sort()).toEqual([
        'driver',
        'vehicle',
      ]);
      expect(audits.find((row) => row.subject === 'driver')?.changes).toEqual({
        phone: { from: null, to: '+49 1' },
        city: { from: null, to: 'Dresden' },
        publicationPreference: { from: null, to: 'hidden' },
      });
      const loaded = await entryRepo.getById(admin(a.org.id), a.entry.id);
      expect(loaded?.adminDetails?.driver).toMatchObject({
        name: 'Hans Peter von Berg',
        firstName: 'Hans Peter',
        lastName: 'von Berg',
        phone: '+49 1',
        city: 'Dresden',
        publicationPreference: 'hidden',
        identityShared: false,
        registrationEntryCount: 1,
      });
      expect(loaded?.adminDetails?.vehicle).toMatchObject({
        displacementCc: 249,
        cylinders: 2,
        ownerName: 'Tom Probe',
      });
      expect(
        loaded?.adminHistory
          ?.filter((item) => item.label.startsWith('data: '))
          .map((item) => [item.label, item.actor]),
      ).toEqual(
        expect.arrayContaining([
          ['data: driver', 'oidc#admin'],
          ['data: vehicle', 'oidc#admin'],
        ]),
      );

      // Another organization can neither edit nor read this entry.
      expect(
        await detail.updateDriver(
          admin(b.org.id),
          a.entry.id,
          { city: 'Leipzig' },
          'oidc#other',
        ),
      ).toBe('not_found');
      expect(
        await detail.updateVehicle(
          admin(b.org.id),
          a.entry.id,
          { make: 'Other' },
          'oidc#other',
        ),
      ).toBe('not_found');
      expect(await detail.listMessages(admin(b.org.id), a.entry.id)).toBeNull();
      expect(
        (
          await db
            .select()
            .from(registrationGroups)
            .where(eq(registrationGroups.id, a.group.id))
        )[0]?.city,
      ).toBe('Dresden');
      await expect(
        detail.updateDriver(
          ctx(a.org.id, ['entry:read']),
          a.entry.id,
          { city: 'X' },
          'oidc#viewer',
        ),
      ).rejects.toThrow('Forbidden');

      // Mails are limited to the entry's registration group and its own tenant.
      for (const [seeded, key] of [
        [a, 'entry-received'],
        [b, 'accepted'],
      ] as const)
        mailIds.push(
          await enqueueMailOutbox(db, seeded.org.id, {
            eventId: seeded.event.id,
            registrationGroupId: seeded.group.id,
            templateKey: key,
            templateVersion: 1,
            locale: 'de',
            recipient: 'tom@example.test',
            idempotencyKey: `detail-${key}-${suffix}`,
            variables: { recipientName: 'Tom' },
          }),
        );
      const messages = await detail.listMessages(admin(a.org.id), a.entry.id);
      expect(messages).toHaveLength(1);
      expect(messages![0]).toMatchObject({
        status: 'pending',
        templateKey: 'entry-received',
        subject: 'Nennung eingegangen: Bergpreis',
        sentAt: null,
      });

      // The invoice summary adds up recorded payments.
      const [invoice] = await db
        .insert(invoices)
        .values({
          organizationId: a.org.id,
          eventId: a.event.id,
          registrationGroupId: a.group.id,
          totalCents: 2500,
          currency: 'EUR',
          paymentReference: createPaymentReference(`detail-${suffix}`),
        })
        .returning();
      await createInvoicePaymentRepository(db).record(
        ctx(a.org.id, ['payment:write']),
        invoice!.id,
        1000,
        'oidc#admin',
        'Überweisung',
      );
      expect(
        (await entryRepo.getById(admin(a.org.id), a.entry.id))?.adminDetails
          ?.invoice,
      ).toMatchObject({ totalCents: 2500, paidCents: 1000 });
    } finally {
      for (const id of mailIds) {
        await db.execute(
          sql`select graphile_worker.remove_job(${`mail-outbox:${id}`})`,
        );
        await db.delete(emailOutbox).where(eq(emailOutbox.id, id));
      }
      for (const id of orgIds) {
        await db.delete(events).where(eq(events.organizationId, id));
        await db.delete(organizations).where(eq(organizations.id, id));
      }
      await pool.end();
    }
  });

  it('keeps a returning driver and a shared vehicle from changing other events', async () => {
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    let orgId: string | undefined;
    const mailIds: string[] = [];
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `detail-scope-${suffix}`,
          name: 'Scope',
          timezone: 'UTC',
          locale: 'de',
        })
        .returning();
      orgId = org!.id;
      const [driver] = await db
        .insert(people)
        .values({
          organizationId: orgId,
          firstName: 'Anna',
          lastName: 'Rennfahrerin',
          email: `anna-${suffix}@example.test`,
          dateOfBirth: '1990-05-05',
        })
        .returning();
      const [sharedVehicle] = await db
        .insert(vehicles)
        .values({ organizationId: orgId, make: 'NSU', model: 'TT' })
        .returning();
      // The same person registers for two events (as the public registration reuses her) and
      // both entries point at the same vehicle record.
      const registrations = [];
      for (const [index, number] of ['11', '12'].entries()) {
        const [event] = await db
          .insert(events)
          .values({
            organizationId: orgId,
            slug: `event-${index}`,
            name: `Event ${index}`,
            startsOn: '2030-01-01',
            endsOn: '2030-01-01',
          })
          .returning();
        const [klass] = await db
          .insert(eventClasses)
          .values({
            organizationId: orgId,
            eventId: event!.id,
            name: 'Klasse',
            code: 'K',
            vehicleType: 'car',
          })
          .returning();
        const [group] = await db
          .insert(registrationGroups)
          .values({
            organizationId: orgId,
            eventId: event!.id,
            personId: driver!.id,
            contactEmail: driver!.email,
            phone: index === 0 ? '+49 100' : '+49 200',
            city: index === 0 ? 'Altstadt' : 'Neustadt',
          })
          .returning();
        const [entry] = await db
          .insert(entries)
          .values({
            orgaCode: `TEST-${crypto.randomUUID()}`,
            organizationId: orgId,
            eventId: event!.id,
            classId: klass!.id,
            registrationGroupId: group!.id,
            driverPersonId: driver!.id,
            vehicleId: sharedVehicle!.id,
            requestedStartNumber: number,
          })
          .returning();
        mailIds.push(
          await enqueueMailOutbox(db, orgId, {
            eventId: event!.id,
            registrationGroupId: group!.id,
            templateKey: 'entry-received',
            templateVersion: 1,
            locale: 'de',
            recipient: driver!.email!,
            idempotencyKey: `scope-${index}-${suffix}`,
            variables: { recipientName: 'Anna' },
          }),
        );
        registrations.push({ event: event!, group: group!, entry: entry! });
      }
      const [first, second] = registrations as [
        (typeof registrations)[number],
        (typeof registrations)[number],
      ];
      const ctx = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(orgId),
        permissions: new Set(['entry:read', 'entry:write']),
        capabilities: new Set(),
        correlationId: suffix,
      });
      const detail = createEntryDetailRepository(db);
      const entryRepo = createEntryRepository(db);
      const snapshot = async () => ({
        person: (
          await db.select().from(people).where(eq(people.id, driver!.id))
        )[0],
        group: (
          await db
            .select()
            .from(registrationGroups)
            .where(eq(registrationGroups.id, second.group.id))
        )[0],
        entry: (
          await db.select().from(entries).where(eq(entries.id, second.entry.id))
        )[0],
        mails: await db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.registrationGroupId, second.group.id)),
        audits: await db
          .select()
          .from(entryDataAuditEvents)
          .where(eq(entryDataAuditEvents.entryId, second.entry.id)),
      });

      // The editor learns that the person is used elsewhere.
      expect(
        (await entryRepo.getById(ctx, first.entry.id))?.adminDetails?.driver,
      ).toMatchObject({ identityShared: true, phone: '+49 100' });

      // Contact data changes only the registration of the edited entry.
      const before = await snapshot();
      expect(
        await detail.updateDriver(
          ctx,
          first.entry.id,
          { phone: '+49 999', city: 'Dresden' },
          'oidc#admin',
        ),
      ).toBe('updated');
      expect(await snapshot()).toEqual(before);
      expect(
        (await entryRepo.getById(ctx, first.entry.id))?.adminDetails?.driver,
      ).toMatchObject({ phone: '+49 999', city: 'Dresden' });
      expect(
        (await entryRepo.getById(ctx, second.entry.id))?.adminDetails?.driver,
      ).toMatchObject({ phone: '+49 200', city: 'Neustadt' });

      // Name, birth date and country belong to the shared person: refused, nothing written.
      expect(
        await detail.updateDriver(
          ctx,
          first.entry.id,
          { lastName: 'Umbenannt', phone: '+49 555' },
          'oidc#admin',
        ),
      ).toBe('person_shared');
      expect(await snapshot()).toEqual(before);
      expect(
        (await entryRepo.getById(ctx, first.entry.id))?.adminDetails?.driver,
      ).toMatchObject({ lastName: 'Rennfahrerin', phone: '+49 999' });

      // A vehicle used by two entries is copied for the edited entry only.
      expect(
        await detail.updateVehicle(
          ctx,
          first.entry.id,
          { ownerName: 'Anna Rennfahrerin', year: 1969 },
          'oidc#admin',
        ),
      ).toBe('updated');
      expect(await snapshot()).toEqual(before);
      const firstNow = await entryRepo.getById(ctx, first.entry.id);
      const secondNow = await entryRepo.getById(ctx, second.entry.id);
      expect(firstNow?.vehicleId).not.toBe(sharedVehicle!.id);
      expect(secondNow?.vehicleId).toBe(sharedVehicle!.id);
      expect(firstNow?.adminDetails?.vehicle).toMatchObject({
        make: 'NSU',
        ownerName: 'Anna Rennfahrerin',
        year: 1969,
      });
      expect(secondNow?.adminDetails?.vehicle).toMatchObject({
        make: 'NSU',
        ownerName: null,
        year: null,
      });
      const [copyAudit] = await db
        .select()
        .from(entryDataAuditEvents)
        .where(eq(entryDataAuditEvents.entryId, first.entry.id));
      expect(
        (
          await db
            .select()
            .from(entryDataAuditEvents)
            .where(eq(entryDataAuditEvents.subject, 'vehicle'))
        ).find((row) => row.copiedFromId === sharedVehicle!.id),
      ).toBeDefined();
      expect(copyAudit).toBeDefined();
      expect(
        firstNow?.adminHistory?.some(
          (item) => item.label === 'data: vehicle (copy)',
        ),
      ).toBe(true);
      // The vehicle is no longer shared, so a second edit changes the copy in place.
      await detail.updateVehicle(
        ctx,
        first.entry.id,
        { cylinders: 2 },
        'oidc#admin',
      );
      expect((await entryRepo.getById(ctx, first.entry.id))?.vehicleId).toBe(
        firstNow?.vehicleId,
      );
      expect(await snapshot()).toEqual(before);

      // A person used by one registration only can be renamed, and every entry of that
      // registration is audited.
      const [solo] = await db
        .insert(people)
        .values({
          organizationId: orgId,
          firstName: 'Solo',
          lastName: 'Fahrer',
          email: `solo-${suffix}@example.test`,
        })
        .returning();
      const [soloGroup] = await db
        .insert(registrationGroups)
        .values({
          organizationId: orgId,
          eventId: first.event.id,
          personId: solo!.id,
        })
        .returning();
      const [soloClass] = await db
        .select()
        .from(eventClasses)
        .where(eq(eventClasses.eventId, first.event.id));
      const soloEntries = [];
      for (const number of ['21', '22']) {
        const [soloVehicle] = await db
          .insert(vehicles)
          .values({ organizationId: orgId, make: 'Solo', model: number })
          .returning();
        const [soloEntry] = await db
          .insert(entries)
          .values({
            orgaCode: `TEST-${crypto.randomUUID()}`,
            organizationId: orgId,
            eventId: first.event.id,
            classId: soloClass!.id,
            registrationGroupId: soloGroup!.id,
            driverPersonId: solo!.id,
            vehicleId: soloVehicle!.id,
            requestedStartNumber: number,
          })
          .returning();
        soloEntries.push(soloEntry!);
      }
      expect(
        (await entryRepo.getById(ctx, soloEntries[0]!.id))?.adminDetails
          ?.driver,
      ).toMatchObject({ identityShared: false, registrationEntryCount: 2 });
      expect(
        await detail.updateDriver(
          ctx,
          soloEntries[0]!.id,
          { lastName: 'Neuer-Name', phone: '+49 7' },
          'oidc#admin',
        ),
      ).toBe('updated');
      for (const soloEntry of soloEntries) {
        expect(
          (await entryRepo.getById(ctx, soloEntry.id))?.adminDetails?.driver,
        ).toMatchObject({ lastName: 'Neuer-Name', phone: '+49 7' });
        expect(
          await db
            .select()
            .from(entryDataAuditEvents)
            .where(eq(entryDataAuditEvents.entryId, soloEntry.id)),
        ).toHaveLength(1);
      }
    } finally {
      for (const id of mailIds) {
        await db.execute(
          sql`select graphile_worker.remove_job(${`mail-outbox:${id}`})`,
        );
        await db.delete(emailOutbox).where(eq(emailOutbox.id, id));
      }
      if (orgId) {
        await db.delete(events).where(eq(events.organizationId, orgId));
        await db.delete(organizations).where(eq(organizations.id, orgId));
      }
      await pool.end();
    }
  });
});
