import { describe, expect, it } from 'vitest';
import { organizationId } from '@racepilot/core';
import { sql } from 'drizzle-orm';
import {
  createDatabase,
  migrate,
  organizations,
  events,
  eventClasses,
  people,
  vehicles,
  registrationGroups,
  entries,
  createTimingRepository,
} from './index.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL timing adapter', () => {
  it('records, corrects, versions and publishes only within the owning tenant/event', async () => {
    await migrate(url!);
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [orgA] = await db
        .insert(organizations)
        .values({
          slug: `timing-a-${suffix}`,
          name: 'A',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [orgB] = await db
        .insert(organizations)
        .values({
          slug: `timing-b-${suffix}`,
          name: 'B',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [eventA] = await db
        .insert(events)
        .values({
          organizationId: orgA!.id,
          slug: `event-a-${suffix}`,
          name: 'A',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
        })
        .returning();
      const [eventB] = await db
        .insert(events)
        .values({
          organizationId: orgB!.id,
          slug: `event-b-${suffix}`,
          name: 'B',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
        })
        .returning();
      const [classA] = await db
        .insert(eventClasses)
        .values({
          organizationId: orgA!.id,
          eventId: eventA!.id,
          name: 'Class',
          code: 'A',
          vehicleType: 'car',
        })
        .returning();
      const [personA] = await db
        .insert(people)
        .values({
          organizationId: orgA!.id,
          firstName: 'Test',
          lastName: 'Driver',
          email: 'driver@example.test',
          emailNormalized: 'driver@example.test',
          dateOfBirth: '1990-01-01',
        })
        .returning();
      const [vehicleA] = await db
        .insert(vehicles)
        .values({ organizationId: orgA!.id, make: 'A', model: 'B' })
        .returning();
      const [groupA] = await db
        .insert(registrationGroups)
        .values({
          organizationId: orgA!.id,
          eventId: eventA!.id,
          personId: personA!.id,
        })
        .returning();
      const [entryA] = await db
        .insert(entries)
        .values({
          organizationId: orgA!.id,
          eventId: eventA!.id,
          classId: classA!.id,
          registrationGroupId: groupA!.id,
          driverPersonId: personA!.id,
          vehicleId: vehicleA!.id,
          requestedStartNumber: '7',
        })
        .returning();
      const ctxA = {
        deploymentMode: 'cloud' as const,
        organizationId: organizationId(orgA!.id),
        permissions: new Set<string>(),
        capabilities: new Set<string>(),
        correlationId: suffix,
      };
      const ctxB = { ...ctxA, organizationId: organizationId(orgB!.id) };
      const repo = createTimingRepository(db);
      expect(await repo.listEntries(ctxA, eventA!.id)).toEqual([
        { entryId: entryA!.id, startNumber: '7' },
      ]);
      expect(
        await repo.resolveEntry(ctxA, eventA!.id, { startNumber: '7' }),
      ).toEqual({ entryId: entryA!.id, startNumber: '7' });
      const recorded = await repo.record(
        ctxA,
        eventA!.id,
        {
          entryId: entryA!.id,
          run: 1,
          timeMs: 12345,
          exclusion: 'DNF',
          source: 'manual',
          recordedAt: '2030-01-01T10:00:00.000Z',
        },
        'actor-a',
      );
      expect(recorded).toMatchObject({
        timeMs: 12345,
        version: 1,
        active: true,
      });
      await expect(
        repo.record(
          ctxA,
          eventA!.id,
          {
            entryId: entryA!.id,
            run: 1,
            timeMs: 12345,
            source: 'duplicate',
            recordedAt: '2030-01-01T10:00:00.000Z',
          },
          'actor-a',
        ),
      ).rejects.toThrow(/Duplicate timing run/);
      const corrected = await repo.correct(
        ctxA,
        eventA!.id,
        recorded!.id,
        { timeMs: 12000, exclusion: null },
        'actor-a',
      );
      expect(corrected).toMatchObject({
        timeMs: 12000,
        version: 2,
        supersedesId: recorded!.id,
        active: true,
      });
      expect(corrected!.exclusion).toBeUndefined();
      expect(
        (await repo.list(ctxA, eventA!.id)).map((x) => [x.version, x.active]),
      ).toEqual([
        [1, false],
        [2, true],
      ]);
      expect(
        await repo.record(
          ctxA,
          eventB!.id,
          {
            entryId: entryA!.id,
            run: 2,
            timeMs: 10,
            source: 'foreign',
            recordedAt: '2030-01-01T10:00:00.000Z',
          },
          'actor',
        ),
      ).toBeNull();
      expect(await repo.list(ctxB, eventA!.id)).toEqual([]);
      const draft = await repo.createDraft(
        ctxA,
        eventA!.id,
        { version: 1, method: 'fastest-run' },
        [{ rank: 1 }],
        'actor-a',
      );
      expect(draft).toMatchObject({ version: 1, status: 'draft' });
      expect(await repo.latestPublished(ctxA, eventA!.id)).toBeNull();
      const published = await repo.publish(ctxA, eventA!.id, 1, 'actor-a');
      expect(published).toMatchObject({ version: 1, status: 'published' });
      await repo.createDraft(
        ctxA,
        eventA!.id,
        { version: 1, method: 'sum' },
        [{ rank: 1 }],
        'actor-a',
      );
      expect(await repo.latestPublished(ctxA, eventA!.id)).toMatchObject({
        version: 1,
        status: 'published',
      });
      expect(await repo.publish(ctxA, eventA!.id, 2, 'actor-a')).toMatchObject({
        version: 2,
        status: 'published',
      });
      expect(await repo.latestPublished(ctxB, eventA!.id)).toBeNull();
      const audit = await db.execute(
        sql`SELECT action FROM timing_audit WHERE organization_id=${orgA!.id} AND event_id=${eventA!.id}`,
      );
      expect(
        (audit as unknown as { rows: { action: string }[] }).rows.map(
          (x) => x.action,
        ),
      ).toEqual(
        expect.arrayContaining(['record', 'correct', 'draft', 'publish']),
      );
    } finally {
      await pool.end();
    }
  });
});
