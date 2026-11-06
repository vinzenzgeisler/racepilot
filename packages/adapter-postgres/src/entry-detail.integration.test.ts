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
  it('edits driver and vehicle with audit and lists mail and payment state per tenant', async () => {
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
            firstName: 'Tom',
            lastName: 'Probe',
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
            organizationId: org!.id,
            eventId: event!.id,
            classId: klass!.id,
            registrationGroupId: group!.id,
            driverPersonId: driver!.id,
            vehicleId: vehicle!.id,
            requestedStartNumber: label === 'a' ? '42' : '43',
          })
          .returning();
        return { org: org!, event: event!, group: group!, entry: entry! };
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

      // Driver edit is applied, audited with before/after, and visible in the admin history.
      expect(
        await detail.updateDriver(
          admin(a.org.id),
          a.entry.id,
          { phone: '+49 1', city: 'Dresden', publicationPreference: 'hidden' },
          'oidc#admin',
        ),
      ).toBe(true);
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
        phone: '+49 1',
        city: 'Dresden',
        publicationPreference: 'hidden',
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
      ).toBe(false);
      expect(
        await detail.updateVehicle(
          admin(b.org.id),
          a.entry.id,
          { make: 'Other' },
          'oidc#other',
        ),
      ).toBe(false);
      expect(await detail.listMessages(admin(b.org.id), a.entry.id)).toBeNull();
      expect(
        (
          await db
            .select()
            .from(people)
            .where(eq(people.id, a.entry.driverPersonId))
        )[0]?.city,
      ).toBe('Dresden');
      // Writing needs the entry:write permission.
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
});
