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
  people,
  vehicles,
  registrationGroups,
  entries,
  entryAuditEvents,
  createPersonRepository,
  createVehicleRepository,
  createEntryRepository,
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
  it('isolates registration resources and serializes duplicate start numbers; records no audit event when cross-tenant entry creation is rejected', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    let orgA: string | undefined;
    let orgB: string | undefined;
    let orgC: string | undefined;
    try {
      const [a] = await db
        .insert(organizations)
        .values({
          slug: `entry-a-${suffix}`,
          name: 'A',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [b] = await db
        .insert(organizations)
        .values({
          slug: `entry-b-${suffix}`,
          name: 'B',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      orgA = a!.id;
      orgB = b!.id;
      const [c] = await db
        .insert(organizations)
        .values({
          slug: `entry-c-${suffix}`,
          name: 'C',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      orgC = c!.id;
      const [eventA] = await db
        .insert(events)
        .values({
          organizationId: orgA,
          slug: `event-${suffix}`,
          name: 'Race',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
        })
        .returning();
      const [eventB] = await db
        .insert(events)
        .values({
          organizationId: orgB,
          slug: `event-${suffix}`,
          name: 'Race',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
        })
        .returning();
      const [classA] = await db
        .insert(eventClasses)
        .values({
          organizationId: orgA,
          eventId: eventA!.id,
          name: 'A',
          code: 'A',
          vehicleType: 'car',
        })
        .returning();
      const [classB] = await db
        .insert(eventClasses)
        .values({
          organizationId: orgB,
          eventId: eventB!.id,
          name: 'A',
          code: 'A',
          vehicleType: 'car',
        })
        .returning();
      const [personA] = await db
        .insert(people)
        .values({
          organizationId: orgA,
          firstName: 'Same',
          lastName: 'Name',
          email: 'same@example.test',
          emailNormalized: 'same@example.test',
          dateOfBirth: '2000-01-01',
        })
        .returning();
      const [personB] = await db
        .insert(people)
        .values({
          organizationId: orgB,
          firstName: 'Same',
          lastName: 'Name',
          email: 'same@example.test',
          emailNormalized: 'same@example.test',
          dateOfBirth: '2000-01-01',
        })
        .returning();
      const [vehicleA] = await db
        .insert(vehicles)
        .values({ organizationId: orgA, make: 'X', model: 'Y' })
        .returning();
      const [vehicleB] = await db
        .insert(vehicles)
        .values({ organizationId: orgB, make: 'X', model: 'Y' })
        .returning();
      const [groupA] = await db
        .insert(registrationGroups)
        .values({
          organizationId: orgA,
          eventId: eventA!.id,
          personId: personA!.id,
        })
        .returning();
      const [groupB] = await db
        .insert(registrationGroups)
        .values({
          organizationId: orgB,
          eventId: eventB!.id,
          personId: personB!.id,
        })
        .returning();
      const ctxA = {
        deploymentMode: 'community' as const,
        organizationId: organizationId(orgA),
        permissions: new Set<string>(),
        capabilities: new Set<string>(),
        correlationId: suffix,
      };
      expect(
        await createPersonRepository(db).getById(ctxA, personB!.id),
      ).toBeNull();
      expect(
        await createVehicleRepository(db).getById(ctxA, vehicleB!.id),
      ).toBeNull();
      const ctxC = { ...ctxA, organizationId: organizationId(orgC!) };
      const duplicate = await createPersonRepository(db).findDuplicate(
        ctxC,
        'SAME@example.test',
        'Same',
        'Name',
        '2000-01-01',
      );
      expect(duplicate.person).toBeNull();
      expect(duplicate.nameAndBirthdateMatch).toBe(false);
      const attempted = (
        personId: string,
        vehicleId: string,
        groupId: string,
        clsId: string,
      ) =>
        db
          .insert(entries)
          .values({
            organizationId: orgA!,
            eventId: eventA!.id,
            classId: clsId,
            registrationGroupId: groupId,
            driverPersonId: personId,
            vehicleId,
            requestedStartNumber: 'A-01',
          })
          .returning();
      const [entryA] = await attempted(
        personA!.id,
        vehicleA!.id,
        groupA!.id,
        classA!.id,
      );
      expect(entryA).toBeDefined();
      await expect(
        attempted(personA!.id, vehicleA!.id, groupA!.id, classA!.id),
      ).rejects.toThrow();
      await expect(
        attempted(personB!.id, vehicleA!.id, groupA!.id, classA!.id),
      ).rejects.toThrow();
      await expect(
        attempted(personA!.id, vehicleB!.id, groupA!.id, classA!.id),
      ).rejects.toThrow();
      await expect(
        attempted(personA!.id, vehicleA!.id, groupB!.id, classA!.id),
      ).rejects.toThrow();
      const results = await Promise.allSettled(
        [1, 2, 3, 4].map(() =>
          db
            .insert(entries)
            .values({
              organizationId: orgB!,
              eventId: eventB!.id,
              classId: classB!.id,
              registrationGroupId: groupB!.id,
              driverPersonId: personB!.id,
              vehicleId: vehicleB!.id,
              requestedStartNumber: 'PARALLEL',
            })
            .returning(),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(3);
      const foreignEntryId =
        results.find((result) => result.status === 'fulfilled')?.status ===
        'fulfilled'
          ? results.find((result) => result.status === 'fulfilled')?.value[0]
              ?.id
          : undefined;
      expect(foreignEntryId).toBeDefined();
      expect(
        await createEntryRepository(db).getById(ctxA, foreignEntryId!),
      ).toBeNull();
      expect(
        await db
          .select()
          .from(entryAuditEvents)
          .where(eq(entryAuditEvents.organizationId, orgA)),
      ).toHaveLength(0);
      const transitioned = await createEntryRepository(db).transition(
        ctxA,
        entryA!.id,
        'verification',
        'unverified',
        'verified',
        'admin',
        'documents checked',
      );
      expect(transitioned?.verificationStatus).toBe('verified');
      const audit = await db
        .select()
        .from(entryAuditEvents)
        .where(eq(entryAuditEvents.organizationId, orgA));
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        entryId: entryA!.id,
        fromStatus: 'unverified',
        toStatus: 'verified',
        actor: 'admin',
        reason: 'documents checked',
      });
    } finally {
      await db.delete(events).where(eq(events.slug, `event-${suffix}`));
      if (orgA)
        await db.delete(organizations).where(eq(organizations.id, orgA));
      if (orgB)
        await db.delete(organizations).where(eq(organizations.id, orgB));
      if (orgC)
        await db.delete(organizations).where(eq(organizations.id, orgC));
      await pool.end();
    }
  });
});
