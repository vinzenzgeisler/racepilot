import { eq } from 'drizzle-orm';
import { describe, it, expect } from 'vitest';
import {
  createDatabase,
  ensureCommunityOrganization,
  createEventRepository,
  organizations,
  events,
} from './index.js';
const url = process.env.RACEPILOT_TEST_DATABASE_URL;
describe.skipIf(!url && process.env.CI !== 'true')(
  'PostgreSQL integration',
  () => {
    it('bootstraps idempotently and filters foreign event IDs', async () => {
      if (!url)
        throw new Error('RACEPILOT_TEST_DATABASE_URL is required in CI');
      const { db, pool } = await createDatabase(url);
      try {
        const a = await ensureCommunityOrganization(db, {
          slug: 'tenant-a-test',
          name: 'A',
          timezone: 'UTC',
          locale: 'en',
        });
        const repo = createEventRepository(db);
        const ctx = {
          deploymentMode: 'cloud' as const,
          organizationId: a.id,
          permissions: new Set<string>(),
          capabilities: new Set<string>(),
          correlationId: 'test',
        };
        const [b] = await db
          .insert(organizations)
          .values({
            slug: 'tenant-b-test',
            name: 'B',
            timezone: 'UTC',
            locale: 'en',
          })
          .returning();
        const [foreignEvent] = await db
          .insert(events)
          .values({
            organizationId: b!.id,
            slug: 'foreign-event',
            name: 'Foreign event',
            startsOn: '2027-01-01',
            endsOn: '2027-01-02',
          })
          .returning();
        expect(await repo.getById(ctx, foreignEvent!.id)).toBeNull();
        await expect(
          ensureCommunityOrganization(db, {
            slug: 'tenant-a-test',
            name: 'A',
            timezone: 'UTC',
            locale: 'en',
          }),
        ).rejects.toThrow(/exactly one organization/);
        await db.delete(events).where(eq(events.id, foreignEvent!.id));
        await db.delete(organizations).where(eq(organizations.id, b!.id));
        expect(
          (
            await ensureCommunityOrganization(db, {
              slug: 'tenant-a-test',
              name: 'A',
              timezone: 'UTC',
              locale: 'en',
            })
          ).id,
        ).toBe(a.id);
        await expect(
          ensureCommunityOrganization(db, {
            slug: 'other',
            name: 'other',
            timezone: 'UTC',
            locale: 'en',
          }),
        ).rejects.toThrow(/slug/);
      } finally {
        await pool.end();
      }
    });
  },
);
