import { and, eq, inArray } from 'drizzle-orm';
import { organizationId } from '@racepilot/core';
import { describe, it, expect } from 'vitest';
import {
  createDatabase,
  ensureCommunityOrganization,
  createEventRepository,
  createEventClassRepository,
  organizations,
  events,
  eventClasses,
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
      ]).toEqual([]);
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
  it('serializes concurrent verified-email bootstrap and grants only one admin', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `bootstrap-race-${suffix}`,
          name: 'Bootstrap race',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const orgId = organizationId(org!.id);
      const repository = createMembershipRepository(db);
      const bootstrap = {
        issuer: 'https://issuer.example',
        email: 'initial-admin@example.test',
      };
      const candidates = ['first', 'second', 'third'].map((subject) => ({
        issuer: bootstrap.issuer,
        subject: `${subject}-${suffix}`,
        email: bootstrap.email,
        emailVerified: true,
      }));
      const permissions = await Promise.all(
        candidates.map((identity) =>
          repository.resolvePermissions(identity, orgId, bootstrap),
        ),
      );
      expect(
        permissions.filter((granted) => granted.has('organization:update')),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(organizationMemberships)
          .where(eq(organizationMemberships.organizationId, orgId)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, orgId),
              eq(organizationMemberships.role, 'admin'),
            ),
          ),
      ).toHaveLength(1);
      expect(
        await repository.resolvePermissions(
          { ...candidates[0]!, subject: `later-${suffix}` },
          orgId,
          bootstrap,
        ),
      ).toEqual(new Set());
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.slug, `bootstrap-race-${suffix}`));
      await db
        .delete(userIdentities)
        .where(
          inArray(userIdentities.subject, [
            `first-${suffix}`,
            `second-${suffix}`,
            `third-${suffix}`,
            `later-${suffix}`,
          ]),
        );
      await pool.end();
    }
  });
  it('does not promote the configured subject after any membership exists', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `bootstrap-subject-${suffix}`,
          name: 'Subject bootstrap',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [priorIdentity] = await db
        .insert(userIdentities)
        .values({
          issuer: 'https://issuer.example',
          subject: `prior-${suffix}`,
        })
        .returning();
      const orgId = organizationId(org!.id);
      await db.insert(organizationMemberships).values({
        organizationId: orgId,
        userIdentityId: priorIdentity!.id,
        role: 'admin',
        status: 'disabled',
      });
      const repository = createMembershipRepository(db);
      const bootstrap = {
        issuer: 'https://issuer.example',
        subject: `configured-${suffix}`,
      };
      expect(
        await repository.resolvePermissions(
          { issuer: bootstrap.issuer, subject: bootstrap.subject },
          orgId,
          bootstrap,
        ),
      ).toEqual(new Set());
      expect(
        await db
          .select()
          .from(organizationMemberships)
          .where(eq(organizationMemberships.organizationId, orgId)),
      ).toHaveLength(1);
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.slug, `bootstrap-subject-${suffix}`));
      await db
        .delete(userIdentities)
        .where(
          inArray(userIdentities.subject, [
            `prior-${suffix}`,
            `configured-${suffix}`,
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
      const classRepo = createEventClassRepository(db);
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
      const [foreignClass] = await db
        .insert(eventClasses)
        .values({
          organizationId: b!.id,
          eventId: foreignEvent!.id,
          name: 'Foreign class',
          code: 'FOREIGN',
          vehicleType: 'car',
        })
        .returning();
      expect(
        await classRepo.update(ctx, foreignEvent!.id, foreignClass!.id, {
          closed: true,
        }),
      ).toBeNull();
      expect(await classRepo.listByEvent(ctx, foreignEvent!.id)).toEqual([]);
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
