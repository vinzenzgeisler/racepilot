import { eq, inArray } from 'drizzle-orm';
import { organizationId } from '@racepilot/core';
import { describe, it, expect } from 'vitest';
import {
  createDatabase,
  ensureCommunityOrganization,
  createEventRepository,
  organizations,
  events,
  createMembershipRepository,
  userIdentities,
  organizationMemberships,
} from './index.js';
const url = process.env.RACEPILOT_TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL integration', () => {
  it('keeps identities issuer-scoped, bootstraps admin idempotently, and revokes disabled membership', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `membership-${suffix}`,
          name: 'Membership',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const repository = createMembershipRepository(db);
      const orgId = organizationId(org!.id);
      const bootstrap = {
        issuer: 'https://issuer.example',
        subject: `first-admin-${suffix}`,
      };
      const admin = {
        issuer: bootstrap.issuer,
        subject: bootstrap.subject,
        email: 'shared@example.test',
        emailVerified: true,
      };
      expect([
        ...(await repository.resolvePermissions(admin, orgId, bootstrap)),
      ]).toContain('organization:update');
      expect([
        ...(await repository.resolvePermissions(admin, orgId, bootstrap)),
      ]).toContain('organization:update');
      const otherIssuer = {
        ...admin,
        issuer: 'https://another-issuer.example',
      };
      expect([
        ...(await repository.resolvePermissions(otherIssuer, orgId, bootstrap)),
      ]).toEqual([]);
      expect(
        await db
          .select()
          .from(userIdentities)
          .where(eq(userIdentities.email, 'shared@example.test')),
      ).toHaveLength(2);
      const emailBootstrap = {
        issuer: bootstrap.issuer,
        email: 'verified@example.test',
      };
      const emailAdmin = {
        issuer: bootstrap.issuer,
        subject: `email-admin-${suffix}`,
        email: emailBootstrap.email,
        emailVerified: true,
      };
      expect([
        ...(await repository.resolvePermissions(
          emailAdmin,
          orgId,
          emailBootstrap,
        )),
      ]).toContain('organization:update');
      expect([
        ...(await repository.resolvePermissions(
          {
            ...emailAdmin,
            subject: `unverified-${suffix}`,
            emailVerified: false,
          },
          orgId,
          emailBootstrap,
        )),
      ]).toEqual([]);
      const [stored] = await db
        .select()
        .from(userIdentities)
        .where(eq(userIdentities.issuer, bootstrap.issuer));
      const [membership] = await db
        .select()
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userIdentityId, stored!.id));
      expect(membership?.role).toBe('admin');
      await db
        .update(organizationMemberships)
        .set({ status: 'disabled' })
        .where(eq(organizationMemberships.userIdentityId, stored!.id));
      expect([
        ...(await repository.resolvePermissions(admin, orgId, bootstrap)),
      ]).toEqual([]);
      expect(
        await db
          .select()
          .from(userIdentities)
          .where(eq(userIdentities.id, stored!.id)),
      ).toHaveLength(1);
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.slug, `membership-${suffix}`));
      await db
        .delete(userIdentities)
        .where(
          inArray(userIdentities.subject, [
            `first-admin-${suffix}`,
            `email-admin-${suffix}`,
            `unverified-${suffix}`,
          ]),
        );
      await pool.end();
    }
  });
  it('bootstraps idempotently and filters foreign event IDs', async () => {
    if (!url) throw new Error('RACEPILOT_TEST_DATABASE_URL is required in CI');
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
});
