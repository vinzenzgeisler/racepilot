import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createDatabase,
  createPostgresRegistrationRateLimiter,
  createPublicRegistrationRateLimitSettingsRepository,
} from './index.js';
import { createRequestContext, organizationId } from '@racepilot/core';

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

  it('persists tenant-scoped organization and event overrides with independent fallback', async () => {
    const connection = await createDatabase(url!);
    const orgA = randomUUID();
    const orgB = randomUUID();
    const eventA1 = randomUUID();
    const eventA2 = randomUUID();
    const eventB1 = randomUUID();
    const contextA = createRequestContext({
      deploymentMode: 'cloud',
      organizationId: organizationId(orgA),
      permissions: new Set(),
      capabilities: new Set(),
      correlationId: randomUUID(),
    });
    const contextB = createRequestContext({
      deploymentMode: 'cloud',
      organizationId: organizationId(orgB),
      permissions: new Set(),
      capabilities: new Set(),
      correlationId: randomUUID(),
    });
    const settings = createPublicRegistrationRateLimitSettingsRepository(
      connection.db,
    );
    try {
      await connection.db.execute(sql`
        insert into organization (id, slug, name, timezone, locale)
        values (${orgA}, ${`rate-${orgA}`}, 'Rate test A', 'UTC', 'en'),
               (${orgB}, ${`rate-${orgB}`}, 'Rate test B', 'UTC', 'en')
      `);
      await connection.db.execute(sql`
        insert into event (id, organization_id, slug, name, starts_on, ends_on)
        values (${eventA1}, ${orgA}, 'first', 'First', '2026-01-01', '2026-01-02'),
               (${eventA2}, ${orgA}, 'second', 'Second', '2026-01-01', '2026-01-02'),
               (${eventB1}, ${orgB}, 'first', 'First', '2026-01-01', '2026-01-02')
      `);
      await settings.updateOrganization(
        contextA,
        { organizationLimit: 20, eventLimit: 10, windowSeconds: 30 },
        'test|admin-a',
      );
      await settings.updateEvent(
        contextA,
        eventA1,
        { eventLimit: 2, windowSeconds: 5 },
        'test|admin-a',
      );
      expect(await settings.getOrganization(contextA)).toEqual({
        organizationLimit: 20,
        eventLimit: 10,
        windowSeconds: 30,
      });
      expect(await settings.resolvePublicEvent(contextA, 'first')).toEqual({
        eventId: eventA1,
        organization: {
          organizationLimit: 20,
          eventLimit: 10,
          windowSeconds: 30,
        },
        event: { eventLimit: 2, windowSeconds: 5 },
      });
      expect(await settings.resolvePublicEvent(contextA, 'second')).toEqual({
        eventId: eventA2,
        organization: {
          organizationLimit: 20,
          eventLimit: 10,
          windowSeconds: 30,
        },
        event: null,
      });
      expect(await settings.resolvePublicEvent(contextB, 'first')).toEqual({
        eventId: eventB1,
        organization: null,
        event: null,
      });
      expect(await settings.getEvent(contextA, eventB1)).toBeNull();
      expect(
        await settings.updateEvent(
          contextA,
          eventB1,
          { eventLimit: 1 },
          'test|admin-a',
        ),
      ).toBeNull();
    } finally {
      await connection.db.execute(sql`
        delete from event where organization_id in (${orgA}, ${orgB})
      `);
      await connection.db.execute(sql`
        delete from organization where id in (${orgA}, ${orgB})
      `);
      await connection.pool.end();
    }
  });
});
