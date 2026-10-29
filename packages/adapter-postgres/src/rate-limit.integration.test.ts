import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createDatabase,
  createPostgresRegistrationRateLimiter,
} from './index.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;

describe.skipIf(!url)('PostgreSQL public registration rate limiter', () => {
  it('persists isolated organization/event token buckets across instances and retries', async () => {
    const firstConnection = await createDatabase(url!);
    const secondConnection = await createDatabase(url!);
    const identity = `198.51.100.2:${randomUUID()}`;
    const otherIdentity = `198.51.100.3:${randomUUID()}`;
    let now = Date.now();
    const firstInstance = createPostgresRegistrationRateLimiter(
      firstConnection.db,
      { now: () => now },
    );
    const secondInstance = createPostgresRegistrationRateLimiter(
      secondConnection.db,
      { now: () => now },
    );
    const organization = {
      key: `organization:tenant-a:${randomUUID()}`,
      limit: 2,
      windowMs: 1_000,
    };
    const firstEvent = {
      key: `event:tenant-a:first:${randomUUID()}`,
      limit: 1,
      windowMs: 1_000,
    };
    const secondEvent = {
      key: `event:tenant-a:second:${randomUUID()}`,
      limit: 1,
      windowMs: 1_000,
    };
    const otherTenantScopes = [
      { ...organization, key: `organization:tenant-b:${randomUUID()}` },
      { ...firstEvent, key: `event:tenant-b:first:${randomUUID()}` },
    ];
    const concurrentScopes = [
      { ...organization, key: `organization:race:${randomUUID()}`, limit: 1 },
      { ...firstEvent, key: `event:race:${randomUUID()}` },
    ];
    const scopes = [organization, firstEvent];
    const clientHash = createHash('sha256').update(identity).digest('hex');
    const otherClientHash = createHash('sha256')
      .update(otherIdentity)
      .digest('hex');
    try {
      expect((await firstInstance.consume(identity, scopes)).allowed).toBe(
        true,
      );
      const eventBurst = await secondInstance.consume(identity, scopes);
      expect(eventBurst.allowed).toBe(false);
      expect(eventBurst.retryAfterMs).toBeGreaterThan(0);
      expect(eventBurst.retryAfterMs).toBeLessThanOrEqual(1_000);

      // A rejected event request must not consume the shared organization budget.
      expect(
        (await secondInstance.consume(identity, [organization, secondEvent]))
          .allowed,
      ).toBe(true);
      expect(
        (
          await firstInstance.consume(identity, [
            organization,
            { ...secondEvent, key: `event:tenant-a:third:${randomUUID()}` },
          ])
        ).allowed,
      ).toBe(false);

      // A different client and a different tenant each get independent budgets.
      expect(
        (await secondInstance.consume(otherIdentity, scopes)).allowed,
      ).toBe(true);
      expect(
        (await secondInstance.consume(identity, otherTenantScopes)).allowed,
      ).toBe(true);
      const concurrent = await Promise.all([
        firstInstance.consume(identity, concurrentScopes),
        secondInstance.consume(identity, concurrentScopes),
      ]);
      expect(concurrent.filter((result) => result.allowed)).toHaveLength(1);

      now += 1_001;
      expect((await secondInstance.consume(identity, scopes)).allowed).toBe(
        true,
      );
    } finally {
      await firstConnection.db.execute(sql`
        delete from public_registration_rate_limit
        where client_hash in (${clientHash}, ${otherClientHash})
      `);
      await Promise.all([
        firstConnection.pool.end(),
        secondConnection.pool.end(),
      ]);
    }
  });
});
