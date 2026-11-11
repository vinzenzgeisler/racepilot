import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createRequestContext, organizationId } from '@racepilot/core';
import {
  createDatabase,
  migrate,
  createEntryDocumentsRepository,
  createEntryRepository,
  organizations,
  events,
  eventClasses,
  people,
  vehicles,
  registrationGroups,
  entries,
} from './index.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
describe.skipIf(!url)(
  'entry documents and orga code PostgreSQL integration',
  () => {
    it('allocates unique codes concurrently and isolates documents by tenant and entry', async () => {
      await migrate(url!);
      const { db, pool } = await createDatabase(url!);
      const suffix = crypto.randomUUID();
      const organizationIds: string[] = [];
      const eventIds: string[] = [];
      try {
        const createTenant = async (name: string) => {
          const [organization] = await db
            .insert(organizations)
            .values({
              slug: `documents-${name}-${suffix}`,
              name,
              timezone: 'UTC',
              locale: 'en',
            })
            .returning();
          organizationIds.push(organization!.id);
          const [event] = await db
            .insert(events)
            .values({
              organizationId: organization!.id,
              slug: 'race-2026',
              orgaCodePrefix: 'RACE',
              name,
              startsOn: '2030-01-01',
              endsOn: '2030-01-01',
            })
            .returning();
          eventIds.push(event!.id);
          const [eventClass] = await db
            .insert(eventClasses)
            .values({
              organizationId: organization!.id,
              eventId: event!.id,
              name: 'Touring',
              code: 'TOUR',
              vehicleType: 'car',
            })
            .returning();
          const [person] = await db
            .insert(people)
            .values({
              organizationId: organization!.id,
              firstName: 'Alex',
              lastName: name,
            })
            .returning();
          const [vehicle] = await db
            .insert(vehicles)
            .values({
              organizationId: organization!.id,
              make: 'Test',
              model: 'Car',
            })
            .returning();
          const [group] = await db
            .insert(registrationGroups)
            .values({
              organizationId: organization!.id,
              eventId: event!.id,
              personId: person!.id,
            })
            .returning();
          const [entry] = await db
            .insert(entries)
            .values({
              organizationId: organization!.id,
              eventId: event!.id,
              classId: eventClass!.id,
              registrationGroupId: group!.id,
              driverPersonId: person!.id,
              vehicleId: vehicle!.id,
            })
            .returning();
          return {
            organization: organization!,
            event: event!,
            eventClass: eventClass!,
            person: person!,
            vehicle: vehicle!,
            group: group!,
            entry: entry!,
          };
        };
        const tenantA = await createTenant('A');
        const tenantB = await createTenant('B');
        const createEntry = async () => {
          const [created] = await db
            .insert(entries)
            .values({
              organizationId: tenantA.organization.id,
              eventId: tenantA.event.id,
              classId: tenantA.eventClass.id,
              registrationGroupId: tenantA.group.id,
              driverPersonId: tenantA.person.id,
              vehicleId: tenantA.vehicle.id,
            })
            .returning();
          return created!;
        };
        const concurrentEntries = await Promise.all(
          Array.from({ length: 24 }, createEntry),
        );
        const codes = [
          tenantA.entry.orgaCode,
          ...concurrentEntries.map((entry) => entry.orgaCode),
        ];
        expect(new Set(codes).size).toBe(codes.length);
        expect(codes.every((code) => /^RACE-[0-9A-Z]{5}$/.test(code))).toBe(
          true,
        );

        const repository = createEntryDocumentsRepository(db);
        const contextA = createRequestContext({
          deploymentMode: 'community',
          organizationId: organizationId(tenantA.organization.id),
          permissions: new Set(['entry:read', 'entry:write']),
          capabilities: new Set(),
          correlationId: 'tenant-a',
        });
        const contextB = createRequestContext({
          deploymentMode: 'community',
          organizationId: organizationId(tenantB.organization.id),
          permissions: new Set(['entry:read', 'entry:write']),
          capabilities: new Set(),
          correlationId: 'tenant-b',
        });
        expect(
          (
            await repository.saveTypes(
              contextA,
              tenantA.event.id,
              [
                {
                  key: 'license',
                  name: 'Fahrerlizenz',
                  required: true,
                  hint: null,
                },
              ],
              'admin-a',
            )
          ).ok,
        ).toBe(true);
        expect(
          await repository.getEntry(contextB, tenantA.entry.id),
        ).toBeNull();
        expect(
          await repository.listByEntry(contextB, tenantA.entry.id),
        ).toMatchObject({ ok: false, error: 'not_found' });
        expect(
          await repository.upload(contextB, {
            entryId: tenantA.entry.id,
            typeKey: 'license',
            fileName: 'x.pdf',
            contentType: 'application/pdf',
            size: 10,
            sha256: 'a'.repeat(64),
            objectId: crypto.randomUUID(),
            actor: 'admin-b',
          }),
        ).toMatchObject({ ok: false, error: 'not_found' });
        const uploaded = await repository.upload(contextA, {
          entryId: tenantA.entry.id,
          typeKey: 'license',
          fileName: 'license.pdf',
          contentType: 'application/pdf',
          size: 10,
          sha256: 'a'.repeat(64),
          objectId: crypto.randomUUID(),
          actor: 'admin-a',
        });
        expect(uploaded).toMatchObject({
          ok: true,
          value: { status: 'uploaded', uploadedBy: 'admin-a' },
        });
        const entryRepository = createEntryRepository(db);
        expect(
          (await entryRepository.getById(contextA, tenantA.entry.id))
            ?.statusProjection?.documents,
        ).toEqual({ complete: 1, total: 1 });
        if (uploaded.ok)
          expect(
            await repository.decide(contextA, {
              entryId: tenantA.entry.id,
              documentId: uploaded.value.id,
              status: 'rejected',
              reason: 'Unleserlich',
              actor: 'admin-a',
            }),
          ).toMatchObject({
            ok: true,
            value: { status: 'rejected', rejectionReason: 'Unleserlich' },
          });
        expect(
          (await entryRepository.getById(contextA, tenantA.entry.id))
            ?.statusProjection?.documents,
        ).toEqual({ complete: 0, total: 1 });
      } finally {
        for (const id of eventIds)
          await db.delete(events).where(eq(events.id, id));
        for (const id of organizationIds)
          await db.delete(organizations).where(eq(organizations.id, id));
        await pool.end();
      }
    });
  },
);
