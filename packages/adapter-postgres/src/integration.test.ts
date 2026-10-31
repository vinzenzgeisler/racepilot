import { and, eq, inArray } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import {
  organizationId,
  createPaymentReference,
  createModuleRegistry,
  createRequestContext,
  listEventModules,
  resolveEventModuleAccess,
  setEventModule,
  setOrganizationModule,
  defaultEntryWorkflow,
  defaultEntryStatusDimensionConfig,
  EntryStatusInUseError,
  transitionEntry,
} from '@racepilot/core';
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
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
  eventClassPricingRules,
  createInvoicePaymentRepository,
  createPersonRepository,
  createVehicleRepository,
  createEntryRepository,
  createInvoiceRepository,
  createPublicRegistrationService,
  createRegistrationSettingsRepository,
  createEntryWorkflowRepository,
  createEntryStatusDimensionRepository,
  createEventConsentRepository,
  registrationSettingsAudit,
  eventConsentTermsAudit,
  groupEmailVerifications,
  saveMailTemplateVersion,
  emailOutbox,
  consentEvidence,
  createEntryExportRepository,
  createEntryConfirmationRepository,
  createArtifactJobRepository,
  artifactJobs as artifactJobTable,
  createModuleActivationRepository,
  moduleActivationAudit,
  eventModules,
  eventEntryStatusDimensionConfigs,
  eventEntryStatusDimensionConfigAudit,
  entryStatusDimensionValues,
  entryStatusDimensionAudit,
  entryStatusHintsAudit,
} from './index.js';
const url = process.env.RACEPILOT_TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL integration', () => {
  it('isolates status configuration, transitions, and audits by event and organization', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    const createdOrganizationIds: string[] = [];
    const createdEventIds: string[] = [];
    try {
      const [orgA, orgB] = await db
        .insert(organizations)
        .values([
          {
            slug: `status-a-${suffix}`,
            name: 'Status A',
            timezone: 'UTC',
            locale: 'en',
          },
          {
            slug: `status-b-${suffix}`,
            name: 'Status B',
            timezone: 'UTC',
            locale: 'en',
          },
        ])
        .returning();
      createdOrganizationIds.push(orgA!.id, orgB!.id);
      const [eventA1, eventA2, eventB] = await db
        .insert(events)
        .values([
          {
            organizationId: orgA!.id,
            slug: 'one',
            name: 'One',
            startsOn: '2030-01-01',
            endsOn: '2030-01-02',
          },
          {
            organizationId: orgA!.id,
            slug: 'two',
            name: 'Two',
            startsOn: '2030-01-01',
            endsOn: '2030-01-02',
          },
          {
            organizationId: orgB!.id,
            slug: 'one',
            name: 'Other tenant',
            startsOn: '2030-01-01',
            endsOn: '2030-01-02',
          },
        ])
        .returning();
      createdEventIds.push(eventA1!.id, eventA2!.id, eventB!.id);
      const ctx = (organization: string) =>
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(organization),
          permissions: new Set([
            'event:read',
            'event:write',
            'entry:read',
            'entry:write',
          ]),
          capabilities: new Set(),
          correlationId: 'status-dimension-isolation',
        });
      const repository = createEntryStatusDimensionRepository(db);
      const eventConfig = {
        ...defaultEntryStatusDimensionConfig,
        dimensions: defaultEntryStatusDimensionConfig.dimensions.map(
          (dimension) =>
            dimension.key === 'technical_inspection'
              ? {
                  ...dimension,
                  values: dimension.values.map((value) =>
                    value.key === 'pending'
                      ? {
                          ...value,
                          labels: {
                            de: 'Event A1 pending',
                            en: 'Event A1 pending',
                          },
                        }
                      : value,
                  ),
                }
              : dimension,
        ),
      };
      await repository.setEvent(
        ctx(orgA!.id),
        eventA1!.id,
        eventConfig,
        'admin-a',
        'event-specific setup',
      );
      expect(await repository.getEvent(ctx(orgA!.id), eventA1!.id)).toEqual(
        eventConfig,
      );
      expect(await repository.getEvent(ctx(orgA!.id), eventA2!.id)).toEqual(
        defaultEntryStatusDimensionConfig,
      );
      expect(await repository.getEvent(ctx(orgB!.id), eventB!.id)).toEqual(
        defaultEntryStatusDimensionConfig,
      );
      expect(await repository.getEvent(ctx(orgB!.id), eventA1!.id)).toBeNull();
      const [person] = await db
        .insert(people)
        .values({
          organizationId: orgA!.id,
          firstName: 'Test',
          lastName: 'Driver',
        })
        .returning();
      const [vehicle] = await db
        .insert(vehicles)
        .values({ organizationId: orgA!.id, make: 'Test', model: 'Car' })
        .returning();
      const [eventClass] = await db
        .insert(eventClasses)
        .values({
          organizationId: orgA!.id,
          eventId: eventA1!.id,
          name: 'Open',
          code: 'OPEN',
          vehicleType: 'car',
        })
        .returning();
      const [group] = await db
        .insert(registrationGroups)
        .values({
          organizationId: orgA!.id,
          eventId: eventA1!.id,
          personId: person!.id,
        })
        .returning();
      const [entry] = await db
        .insert(entries)
        .values({
          organizationId: orgA!.id,
          eventId: eventA1!.id,
          classId: eventClass!.id,
          registrationGroupId: group!.id,
          driverPersonId: person!.id,
          vehicleId: vehicle!.id,
        })
        .returning();
      expect(
        await repository.transition(
          ctx(orgB!.id),
          entry!.id,
          'technical_inspection',
          'passed',
          'admin-b',
          'foreign entry',
        ),
      ).toBeNull();
      expect(
        await repository.updateHints(
          ctx(orgB!.id),
          entry!.id,
          { passenger: true },
          'admin-b',
          'foreign entry',
        ),
      ).toBe(false);
      expect(
        await repository.transition(
          ctx(orgA!.id),
          entry!.id,
          'technical_inspection',
          'reinspection',
          'admin-a',
          'check failed',
        ),
      ).toBe(true);
      expect(
        await repository.updateHints(
          ctx(orgA!.id),
          entry!.id,
          { passenger: true },
          'admin-a',
          'seat role confirmed',
        ),
      ).toBe(true);
      const projected = await createEntryRepository(db).getById(
        ctx(orgA!.id),
        entry!.id,
      );
      expect(
        projected?.statusProjection?.dimensions.find(
          ({ key }) => key === 'technical_inspection',
        )?.value,
      ).toBe('reinspection');
      expect(projected?.statusProjection?.documents.total).toBe(2);
      expect(
        projected?.statusProjection?.hints.find(
          ({ key }) => key === 'passenger',
        )?.present,
      ).toBe(true);

      // Hold the event row while both operations enter the database. Once both
      // transactions are queued on that same row lock, releasing it lets PG
      // choose either serial order without permitting a stale config write.
      const technical = eventConfig.dimensions.find(
        ({ key }) => key === 'technical_inspection',
      )!;
      const targetKey = 'race_target';
      const configWithTarget = {
        ...eventConfig,
        dimensions: eventConfig.dimensions.map((dimension) =>
          dimension.key === 'technical_inspection'
            ? {
                ...dimension,
                values: [
                  ...dimension.values,
                  {
                    key: targetKey,
                    labels: { de: 'Race target', en: 'Race target' },
                    meaning: 'done' as const,
                  },
                ],
                transitions: [
                  ...dimension.transitions,
                  { from: 'reinspection', to: targetKey },
                ],
              }
            : dimension,
        ),
      };
      expect(technical.values.some(({ key }) => key === targetKey)).toBe(false);
      await repository.setEvent(
        ctx(orgA!.id),
        eventA1!.id,
        configWithTarget,
        'admin-a',
        'enable race target',
      );
      const barrier = await pool.connect();
      await barrier.query('BEGIN');
      await barrier.query(
        'SELECT id FROM event WHERE organization_id = $1 AND id = $2 FOR UPDATE',
        [orgA!.id, eventA1!.id],
      );
      const transition = repository.transition(
        ctx(orgA!.id),
        entry!.id,
        'technical_inspection',
        targetKey,
        'status-race',
        'race test',
      );
      const removeTarget = repository.setEvent(
        ctx(orgA!.id),
        eventA1!.id,
        eventConfig,
        'status-race',
        'remove race target',
      );
      const outcomes = Promise.allSettled([transition, removeTarget]);
      let lockHeld = true;
      try {
        let waiters = 0;
        for (let attempt = 0; attempt < 100 && waiters < 2; attempt++) {
          const result = await pool.query<{ waiters: string }>(
            `SELECT count(*)::text AS waiters FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
          );
          waiters = Number(result.rows[0]?.waiters ?? 0);
          if (waiters < 2)
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiters).toBeGreaterThanOrEqual(2);
        await barrier.query('COMMIT');
        lockHeld = false;
      } finally {
        if (lockHeld) await barrier.query('ROLLBACK');
        barrier.release();
      }
      const [transitionOutcome, configOutcome] = await outcomes;
      const finalConfig = (await repository.getEvent(
        ctx(orgA!.id),
        eventA1!.id,
      ))!;
      const finalEntry = await createEntryRepository(db).getById(
        ctx(orgA!.id),
        entry!.id,
      );
      const finalStatus = finalEntry!.statusProjection!.dimensions.find(
        ({ key }) => key === 'technical_inspection',
      )!.value;
      const targetRemainsConfigured = finalConfig.dimensions
        .find(({ key }) => key === 'technical_inspection')!
        .values.some(({ key }) => key === targetKey);
      expect(targetRemainsConfigured).toBe(finalStatus === targetKey);
      if (transitionOutcome.status === 'fulfilled') {
        expect(transitionOutcome.value).toBe(true);
        expect(configOutcome.status).toBe('rejected');
        if (configOutcome.status === 'rejected')
          expect(configOutcome.reason).toBeInstanceOf(EntryStatusInUseError);
      } else {
        expect(configOutcome.status).toBe('fulfilled');
        expect(finalStatus).toBe('reinspection');
      }
      expect(
        await db
          .select()
          .from(entryStatusDimensionValues)
          .where(eq(entryStatusDimensionValues.entryId, entry!.id)),
      ).toHaveLength(2);
      expect(
        await db
          .select()
          .from(entryStatusDimensionAudit)
          .where(eq(entryStatusDimensionAudit.entryId, entry!.id)),
      ).toHaveLength(transitionOutcome.status === 'fulfilled' ? 2 : 1);
      expect(
        await db
          .select()
          .from(entryStatusHintsAudit)
          .where(eq(entryStatusHintsAudit.organizationId, orgB!.id)),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(eventEntryStatusDimensionConfigs)
          .where(eq(eventEntryStatusDimensionConfigs.organizationId, orgA!.id)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(eventEntryStatusDimensionConfigAudit)
          .where(
            eq(eventEntryStatusDimensionConfigAudit.organizationId, orgA!.id),
          ),
      ).toHaveLength(configOutcome.status === 'fulfilled' ? 3 : 2);
    } finally {
      if (createdEventIds.length)
        await db.delete(events).where(inArray(events.id, createdEventIds));
      if (createdOrganizationIds.length)
        await db
          .delete(organizations)
          .where(inArray(organizations.id, createdOrganizationIds));
      await pool.end();
    }
  });

  it('persists organization and event workflow revisions with Cloud tenant isolation', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    const createdEventIds: string[] = [];
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `workflow-${suffix}`,
          name: 'Workflow',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [foreign] = await db
        .insert(organizations)
        .values({
          slug: `workflow-foreign-${suffix}`,
          name: 'Foreign',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [event] = await db
        .insert(events)
        .values({
          organizationId: org!.id,
          slug: 'event',
          name: 'Event',
          startsOn: '2030-01-01',
          endsOn: '2030-01-02',
        })
        .returning();
      createdEventIds.push(event!.id);
      const [secondEvent] = await db
        .insert(events)
        .values({
          organizationId: org!.id,
          slug: 'second-event',
          name: 'Second event',
          startsOn: '2030-02-01',
          endsOn: '2030-02-02',
        })
        .returning();
      createdEventIds.push(secondEvent!.id);
      const context = (id: string) =>
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(id),
          permissions: new Set(),
          capabilities: new Set(),
          correlationId: 'workflow-test',
        });
      const repository = createEntryWorkflowRepository(db);
      const orgWorkflow = { ...defaultEntryWorkflow, version: 1 };
      const storedOrg = await repository.getOrganization(context(org!.id));
      expect(storedOrg?.workflow.statuses.map((s) => s.key)).toContain(
        'pending',
      );
      const updatedOrg = await repository.setOrganization(
        context(org!.id),
        orgWorkflow,
        'test-admin',
        'organization change',
      );
      expect(updatedOrg.version).toBe(2);
      const effective = await repository.getEffective(
        context(org!.id),
        event!.id,
      );
      expect(effective?.eventId).toBe(event!.id);
      const customEventWorkflow = {
        ...orgWorkflow,
        statuses: orgWorkflow.statuses.map((status) =>
          status.key === 'pending'
            ? { ...status, labels: { ...status.labels, en: 'Custom pending' } }
            : status,
        ),
      };
      const override = await repository.setEvent(
        context(org!.id),
        event!.id,
        customEventWorkflow,
        'test-admin',
        'event override',
      );
      expect(override?.version).toBe(2);
      const siblingWorkflow = await repository.getEffective(
        context(org!.id),
        secondEvent!.id,
      );
      expect(
        siblingWorkflow?.workflow.statuses.find(
          (status) => status.key === 'pending',
        )?.labels.en,
      ).not.toBe('Custom pending');
      expect(
        await repository.getEffective(context(foreign!.id), event!.id),
      ).toBeNull();
      expect(
        await repository.setEvent(
          context(foreign!.id),
          event!.id,
          orgWorkflow,
          'foreign-admin',
          'forbidden',
        ),
      ).toBeNull();
    } finally {
      if (createdEventIds.length)
        await db.delete(events).where(inArray(events.id, createdEventIds));
      await db
        .delete(organizations)
        .where(
          inArray(organizations.slug, [
            `workflow-${suffix}`,
            `workflow-foreign-${suffix}`,
          ]),
        );
      await pool.end();
    }
  });
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
  it('cloud fixture limits CSV and PDF data to organization and selected event; isolates registration resources and serializes duplicate start numbers; records no audit event when cross-tenant entry creation is rejected', async () => {
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
        permissions: new Set<string>(['entry:write']),
        capabilities: new Set<string>(),
        correlationId: suffix,
      };
      expect(
        await createPersonRepository(db).getById(ctxA, personB!.id),
      ).toBeNull();
      expect(
        await createVehicleRepository(db).getById(ctxA, vehicleB!.id),
      ).toBeNull();
      await runMigrations({ connectionString: url! });
      const artifactJobs = createArtifactJobRepository(db);
      const firstArtifact = await artifactJobs.enqueue(ctxA, {
        eventId: eventA!.id,
        kind: 'confirmation_pdf',
        registrationGroupId: groupA!.id,
        idempotencyKey: `confirmation-${suffix}`,
      });
      const duplicateArtifact = await artifactJobs.enqueue(ctxA, {
        eventId: eventA!.id,
        kind: 'confirmation_pdf',
        registrationGroupId: groupA!.id,
        idempotencyKey: `confirmation-${suffix}`,
      });
      expect(duplicateArtifact.id).toBe(firstArtifact.id);
      expect(firstArtifact.status).toBe('queued');
      const ctxB = { ...ctxA, organizationId: organizationId(orgB!) };
      const staleSameTenant = await artifactJobs.enqueue(ctxA, {
        eventId: eventA!.id,
        kind: 'entries_csv',
        idempotencyKey: `stale-same-tenant-${suffix}`,
      });
      const staleForeignTenant = await artifactJobs.enqueue(ctxB, {
        eventId: eventB!.id,
        kind: 'entries_csv',
        idempotencyKey: `stale-foreign-tenant-${suffix}`,
      });
      const staleClaimedAt = new Date(Date.now() - 10 * 60_000);
      const staleSameTenantToken = crypto.randomUUID();
      const staleForeignTenantToken = crypto.randomUUID();
      await db
        .update(artifactJobTable)
        .set({
          status: 'processing',
          claimedAt: staleClaimedAt,
          claimToken: staleSameTenantToken,
        })
        .where(
          and(
            eq(artifactJobTable.organizationId, ctxA.organizationId),
            eq(artifactJobTable.id, staleSameTenant.id),
          ),
        );
      await db
        .update(artifactJobTable)
        .set({
          status: 'processing',
          claimedAt: staleClaimedAt,
          claimToken: staleForeignTenantToken,
        })
        .where(
          and(
            eq(artifactJobTable.organizationId, ctxB.organizationId),
            eq(artifactJobTable.id, staleForeignTenant.id),
          ),
        );
      const claimContexts = [
        { ...ctxA, jobId: `worker-a-${suffix}` },
        { ...ctxA, jobId: `worker-b-${suffix}` },
      ];
      const claims = await Promise.all(
        claimContexts.map((claimCtx) =>
          artifactJobs.claim(claimCtx, firstArtifact.id),
        ),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      for (const [job, expectedToken] of [
        [staleSameTenant, staleSameTenantToken],
        [staleForeignTenant, staleForeignTenantToken],
      ] as const) {
        const [unchanged] = await db
          .select()
          .from(artifactJobTable)
          .where(eq(artifactJobTable.id, job.id));
        expect(unchanged).toMatchObject({
          status: 'processing',
          claimToken: expectedToken,
          claimedAt: staleClaimedAt,
        });
      }
      const winnerIndex = claims.findIndex(Boolean);
      const firstClaim = claims[winnerIndex]!;
      const winnerContext = claimContexts[winnerIndex]!;
      const loserContext = claimContexts[1 - winnerIndex]!;
      expect(firstClaim.status).toBe('processing');
      expect(
        await artifactJobs.claim(loserContext, firstArtifact.id),
      ).toBeNull();
      await artifactJobs.release(
        loserContext,
        firstArtifact.id,
        crypto.randomUUID(),
      );
      expect((await artifactJobs.getById(ctxA, firstArtifact.id))?.status).toBe(
        'processing',
      );
      await artifactJobs.release(
        winnerContext,
        firstArtifact.id,
        firstClaim.claimToken,
      );
      const retryContext = { ...ctxA, jobId: `worker-retry-${suffix}` };
      const retryClaim = await artifactJobs.claim(
        retryContext,
        firstArtifact.id,
      );
      expect(retryClaim).not.toBeNull();
      expect(retryClaim?.claimToken).not.toBe(firstClaim.claimToken);
      await artifactJobs.complete(
        winnerContext,
        firstArtifact.id,
        firstClaim.claimToken,
        {
          organizationId: organizationId(orgA),
          objectId: crypto.randomUUID(),
          contentType: 'application/pdf',
          size: 1,
          sha256: 'a'.repeat(64),
        },
      );
      expect((await artifactJobs.getById(ctxA, firstArtifact.id))?.status).toBe(
        'processing',
      );
      await artifactJobs.complete(
        retryContext,
        firstArtifact.id,
        retryClaim!.claimToken,
        {
          organizationId: organizationId(orgA),
          objectId: crypto.randomUUID(),
          contentType: 'application/pdf',
          size: 1,
          sha256: 'b'.repeat(64),
        },
      );
      expect((await artifactJobs.getById(ctxA, firstArtifact.id))?.status).toBe(
        'ready',
      );
      expect(
        await artifactJobs.getById(
          { ...ctxA, organizationId: organizationId(orgB!) },
          firstArtifact.id,
        ),
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
        startNumber = 'A-01',
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
            requestedStartNumber: startNumber,
          })
          .returning();
      const [entryA] = await attempted(
        personA!.id,
        vehicleA!.id,
        groupA!.id,
        classA!.id,
      );
      expect(entryA).toBeDefined();
      const snapshot = {
        version: '1' as const,
        currency: 'EUR',
        calculatedAt: '2030-01-01T00:00:00.000Z',
        totalCents: 12500,
        lines: [],
      };
      await db
        .update(entries)
        .set({ priceSnapshotVersion: '1', priceSnapshot: snapshot })
        .where(eq(entries.id, entryA!.id));
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
      await db
        .update(entries)
        .set({ priceSnapshotVersion: '1', priceSnapshot: snapshot })
        .where(eq(entries.id, foreignEntryId!));
      expect(
        await createEntryRepository(db).getById(ctxA, foreignEntryId!),
      ).toBeNull();
      const foreignScopeRepository = createEntryRepository(db);
      expect(
        await foreignScopeRepository.listAdmin!(ctxA, {
          page: 1,
          pageSize: 100,
          eventId: eventB!.id,
          sort: 'createdAt',
          direction: 'desc',
        }),
      ).toMatchObject({ items: [], total: 0 });
      expect(
        await transitionEntry(
          ctxA,
          foreignEntryId!,
          'acceptance',
          'accepted',
          'admin',
          'cross-tenant attempt',
          {
            entries: foreignScopeRepository,
            workflows: createEntryWorkflowRepository(db),
          },
        ),
      ).toBeNull();

      const adminEntries = createEntryRepository(db);
      const pageA = await adminEntries.listAdmin!(ctxA, {
        page: 1,
        pageSize: 100,
        eventId: eventA!.id,
        sort: 'createdAt',
        direction: 'desc',
      });
      expect(pageA.items.map((entry) => entry.id)).toEqual([entryA!.id]);
      expect(pageA.total).toBe(1);
      const noInvoice = await adminEntries.listAdmin!(ctxA, {
        page: 1,
        pageSize: 100,
        eventId: eventA!.id,
        paymentStatus: 'not_required',
        sort: 'createdAt',
        direction: 'desc',
      });
      expect(noInvoice.items.map((entry) => entry.id)).toEqual([entryA!.id]);
      expect(pageA.items[0]?.adminDetails).toEqual({
        driver: {
          name: 'Same Name',
          dateOfBirth: '2000-01-01',
          country: null,
          email: 'same@example.test',
          emailVerified: false,
        },
        vehicle: { make: 'X', model: 'Y', year: null },
        eventClass: { code: 'A', name: 'A' },
        startNumber: 'A-01',
      });
      expect(await adminEntries.getById(ctxA, foreignEntryId!)).toBeNull();
      const byDriverName = await adminEntries.listAdmin!(ctxA, {
        page: 1,
        pageSize: 100,
        search: 'Same',
        sort: 'createdAt',
        direction: 'desc',
      });
      expect(byDriverName.items.map((entry) => entry.id)).toEqual([entryA!.id]);
      expect(byDriverName.total).toBe(1);
      const byEntryId = await adminEntries.listAdmin!(ctxA, {
        page: 1,
        pageSize: 100,
        search: entryA!.id.slice(0, 8),
        sort: 'createdAt',
        direction: 'desc',
      });
      expect(byEntryId.items.map((entry) => entry.id)).toEqual([entryA!.id]);
      expect(byEntryId.total).toBe(1);
      const foreignIdSearch = await adminEntries.listAdmin!(ctxA, {
        page: 1,
        pageSize: 100,
        search: foreignEntryId!.slice(0, 8),
        sort: 'createdAt',
        direction: 'desc',
      });
      expect(foreignIdSearch).toMatchObject({ items: [], total: 0 });
      expect(
        await adminEntries.listAdmin!(ctxA, {
          page: 1,
          pageSize: 100,
          eventId: eventB!.id,
          sort: 'createdAt',
          direction: 'desc',
        }),
      ).toMatchObject({ items: [], total: 0 });
      const cloudCtxA = { ...ctxA, deploymentMode: 'cloud' as const };
      const csvRows = await createEntryExportRepository(db).listByEvent(
        cloudCtxA,
        eventA!.id,
      );
      expect(csvRows).toHaveLength(1);
      expect(csvRows[0]).toMatchObject({
        driver: 'Same Name',
        vehicle: 'X Y',
        class: 'A',
        priceCents: 12500,
      });
      expect(
        await createEntryExportRepository(db).listByEvent(
          cloudCtxA,
          eventB!.id,
        ),
      ).toEqual([]);
      const confirmations = createEntryConfirmationRepository(db);
      const confirmation = await confirmations.getByGroup(
        cloudCtxA,
        eventA!.id,
        groupA!.id,
      );
      expect(confirmation).toMatchObject({
        eventName: 'Race',
        driverName: 'Same Name',
        vehicles: ['X Y'],
        classes: ['A'],
        priceSnapshot: snapshot,
      });
      expect(
        await confirmations.getByGroup(cloudCtxA, eventB!.id, groupB!.id),
      ).toBeNull();
      expect(
        await confirmations.getByGroup(cloudCtxA, eventA!.id, groupB!.id),
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
      const workflows = createEntryWorkflowRepository(db);
      const beforeWorkflow = await workflows.getPinnedForEntry(
        ctxA,
        entryA!.id,
      );
      expect(beforeWorkflow).not.toBeNull();
      const customWorkflow = {
        ...defaultEntryWorkflow,
        statuses: [
          ...defaultEntryWorkflow.statuses,
          {
            key: 'documents_missing',
            labels: { de: 'Unterlagen fehlen', en: 'Documents missing' },
            color: '#ca8a04',
            category: 'pending' as const,
          },
        ],
        transitions: [
          ...defaultEntryWorkflow.transitions,
          {
            from: 'pending',
            to: 'documents_missing',
            reasonRequired: true,
            notify: true,
          },
        ],
      };
      const activeRevision = await workflows.setEvent(
        ctxA,
        eventA!.id,
        customWorkflow,
        'admin',
        'Enable documents status',
      );
      const [entryAfterChange] = await attempted(
        personA!.id,
        vehicleA!.id,
        groupA!.id,
        classA!.id,
        'A-02',
      );
      const oldPinned = await workflows.getPinnedForEntry(ctxA, entryA!.id);
      const newPinned = await workflows.getPinnedForEntry(
        ctxA,
        entryAfterChange!.id,
      );
      expect(entryAfterChange?.acceptanceStatus).toBe('pending');
      expect(newPinned?.id).toBe(activeRevision?.id);
      expect(oldPinned?.id).toBe(beforeWorkflow!.id);
      expect(newPinned?.id).not.toBe(beforeWorkflow!.id);
      expect(oldPinned?.workflow.statuses.map(({ key }) => key)).not.toContain(
        'documents_missing',
      );
      expect(newPinned?.workflow.statuses.map(({ key }) => key)).toContain(
        'documents_missing',
      );
      await expect(
        transitionEntry(
          ctxA,
          entryA!.id,
          'acceptance',
          'documents_missing',
          'admin',
          'missing',
          { entries: createEntryRepository(db), workflows },
        ),
      ).rejects.toThrow();
      await expect(
        transitionEntry(
          ctxA,
          entryAfterChange!.id,
          'acceptance',
          'documents_missing',
          '',
          'missing',
          { entries: createEntryRepository(db), workflows },
        ),
      ).rejects.toThrow(/required/);
      expect(
        await db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.organizationId, orgA!)),
      ).toHaveLength(0);
      await db
        .update(people)
        .set({ email: `driver-${suffix}@example.test` })
        .where(eq(people.id, personA!.id));
      await db
        .update(registrationGroups)
        .set({ contactEmail: null })
        .where(eq(registrationGroups.id, groupA!.id));
      const transitionedCustom = await transitionEntry(
        ctxA,
        entryAfterChange!.id,
        'acceptance',
        'documents_missing',
        'admin',
        'request documents',
        { entries: createEntryRepository(db), workflows },
      );
      expect(transitionedCustom?.acceptanceStatus).toBe('documents_missing');
      const customAudit = await db
        .select()
        .from(entryAuditEvents)
        .where(eq(entryAuditEvents.entryId, entryAfterChange!.id));
      expect(customAudit[0]).toMatchObject({
        toStatus: 'documents_missing',
        statusCategory: 'pending',
        workflowRevisionId: newPinned!.id,
      });
      const statusMails = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, orgA!));
      expect(statusMails).toHaveLength(1);
      expect(statusMails[0]).toMatchObject({
        eventId: eventA!.id,
        templateKey: 'status-change',
        recipient: `driver-${suffix}@example.test`,
        variables: {
          statusKey: 'documents_missing',
          statusLabelDe: 'Unterlagen fehlen',
          statusLabelEn: 'Documents missing',
        },
      });
      await expect(
        transitionEntry(
          ctxB,
          entryAfterChange!.id,
          'acceptance',
          'documents_missing',
          'foreign',
          'request documents',
          { entries: createEntryRepository(db), workflows },
        ),
      ).resolves.toBeNull();
      await expect(
        transitionEntry(
          ctxA,
          entryAfterChange!.id,
          'acceptance',
          'documents_missing',
          'admin',
          'request documents',
          { entries: createEntryRepository(db), workflows },
        ),
      ).rejects.toThrow(/Invalid entry acceptance transition/);
      const afterDuplicate = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, orgA!));
      expect(afterDuplicate).toHaveLength(1);
    } finally {
      if (orgA)
        await db
          .delete(emailOutbox)
          .where(eq(emailOutbox.organizationId, orgA));
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

describe.skipIf(!url)('pricing and invoice isolation', () => {
  it('issues invoices transactionally, rejects changed snapshots, and allocates short concurrent references', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `invoice-sequence-${suffix}`,
          name: 'A',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [event] = await db
        .insert(events)
        .values({
          organizationId: org!.id,
          slug: 'event',
          name: 'A',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
        })
        .returning();
      const [person] = await db
        .insert(people)
        .values({ organizationId: org!.id, firstName: 'A', lastName: 'A' })
        .returning();
      const groups = await Promise.all(
        Array.from({ length: 9 }, async () => {
          const [group] = await db
            .insert(registrationGroups)
            .values({
              organizationId: org!.id,
              eventId: event!.id,
              personId: person!.id,
            })
            .returning();
          return group!;
        }),
      );
      const ctx = {
        deploymentMode: 'community' as const,
        organizationId: organizationId(org!.id),
        permissions: new Set<string>(),
        capabilities: new Set<string>(),
        correlationId: suffix,
      };
      const repo = createInvoiceRepository(db);
      const snapshot = {
        version: '1' as const,
        currency: 'EUR',
        calculatedAt: new Date().toISOString(),
        totalCents: 1200,
        lines: [],
      };
      await expect(
        db.transaction(async (tx) => {
          await repo.issue(ctx, event!.id, groups[0]!.id, snapshot, tx);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(
        await db
          .select()
          .from(invoices)
          .where(eq(invoices.registrationGroupId, groups[0]!.id)),
      ).toHaveLength(0);
      await repo.issue(ctx, event!.id, groups[0]!.id, snapshot);
      await expect(
        repo.issue(ctx, event!.id, groups[0]!.id, {
          ...snapshot,
          totalCents: 1300,
        }),
      ).rejects.toThrow(/does not match/);
      const issued = await Promise.all(
        groups
          .slice(1)
          .map((group) => repo.issue(ctx, event!.id, group.id, snapshot)),
      );
      const refs = issued.map((invoice) => invoice.paymentReference);
      expect(new Set(refs).size).toBe(refs.length);
      expect(refs.every((ref) => /^RF\d{2}\d{8}$/.test(ref))).toBe(true);
    } finally {
      const [cleanupOrg] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, `invoice-sequence-${suffix}`));
      if (cleanupOrg) {
        await db.delete(events).where(eq(events.organizationId, cleanupOrg.id));
        await db
          .delete(organizations)
          .where(eq(organizations.id, cleanupOrg.id));
      }
      await pool.end();
    }
  });
  it('isolates identical payment references by organization and preserves payment corrections as audited reversals', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [a] = await db
        .insert(organizations)
        .values({
          slug: `price-a-${suffix}`,
          name: 'A',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [b] = await db
        .insert(organizations)
        .values({
          slug: `price-b-${suffix}`,
          name: 'B',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      const [ea] = await db
        .insert(events)
        .values({
          organizationId: a!.id,
          slug: 'event',
          name: 'A',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
        })
        .returning();
      const [eb] = await db
        .insert(events)
        .values({
          organizationId: b!.id,
          slug: 'event',
          name: 'B',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
        })
        .returning();
      const [pa] = await db
        .insert(people)
        .values({ organizationId: a!.id, firstName: 'A', lastName: 'A' })
        .returning();
      const [pb] = await db
        .insert(people)
        .values({ organizationId: b!.id, firstName: 'B', lastName: 'B' })
        .returning();
      const [ga] = await db
        .insert(registrationGroups)
        .values({ organizationId: a!.id, eventId: ea!.id, personId: pa!.id })
        .returning();
      const [gb] = await db
        .insert(registrationGroups)
        .values({ organizationId: b!.id, eventId: eb!.id, personId: pb!.id })
        .returning();
      const ref = createPaymentReference(`group-${suffix}`);
      const [ia] = await db
        .insert(invoices)
        .values({
          organizationId: a!.id,
          eventId: ea!.id,
          registrationGroupId: ga!.id,
          totalCents: 1000,
          currency: 'EUR',
          paymentReference: ref,
        })
        .returning();
      const [ib] = await db
        .insert(invoices)
        .values({
          organizationId: b!.id,
          eventId: eb!.id,
          registrationGroupId: gb!.id,
          totalCents: 1000,
          currency: 'EUR',
          paymentReference: ref,
        })
        .returning();
      const [klass] = await db
        .insert(eventClasses)
        .values({
          organizationId: a!.id,
          eventId: ea!.id,
          name: 'A',
          code: 'A',
          vehicleType: 'car',
        })
        .returning();
      const [vehicle] = await db
        .insert(vehicles)
        .values({ organizationId: a!.id, make: 'X', model: 'Y' })
        .returning();
      const storedSnapshot = {
        version: '1' as const,
        currency: 'EUR',
        calculatedAt: '2030-01-01T00:00:00.000Z',
        totalCents: 1000,
        lines: [
          {
            classId: klass!.id,
            quantity: 1,
            baseCents: 1000,
            additionalEntryAdjustmentCents: 0,
            earlyBirdDiscountCents: 0,
            totalCents: 1000,
          },
        ],
      };
      const [entry] = await db
        .insert(entries)
        .values({
          organizationId: a!.id,
          eventId: ea!.id,
          classId: klass!.id,
          registrationGroupId: ga!.id,
          driverPersonId: pa!.id,
          vehicleId: vehicle!.id,
          priceSnapshotVersion: '1',
          priceSnapshot: storedSnapshot,
        })
        .returning();
      await db.insert(eventClassPricingRules).values({
        organizationId: a!.id,
        eventId: ea!.id,
        classId: klass!.id,
        baseCents: 1000,
      });
      await db
        .update(eventClassPricingRules)
        .set({ baseCents: 5000 })
        .where(eq(eventClassPricingRules.classId, klass!.id));
      expect(
        (await db.select().from(entries).where(eq(entries.id, entry!.id)))[0]
          ?.priceSnapshot,
      ).toEqual(storedSnapshot);
      await expect(
        db
          .update(entries)
          .set({ priceSnapshot: { ...storedSnapshot, totalCents: 5000 } })
          .where(eq(entries.id, entry!.id)),
      ).rejects.toThrow();
      const ctxA = {
        deploymentMode: 'community' as const,
        organizationId: organizationId(a!.id),
        permissions: new Set(['payment:write']),
        capabilities: new Set<string>(),
        correlationId: suffix,
      };
      const ctxB = { ...ctxA, organizationId: organizationId(b!.id) };
      const repo = createInvoicePaymentRepository(db);
      const receipt = await repo.record(
        ctxA,
        ia!.id,
        1000,
        'admin',
        'bank transfer',
      );
      expect(receipt).not.toBeNull();
      expect(
        (
          await db
            .select()
            .from(invoices)
            .where(eq(invoices.organizationId, b!.id))
        )[0]?.status,
      ).toBe('open');
      const payment = (
        await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.invoiceId, ia!.id))
      )[0]!;
      const reversal = await repo.correct(
        ctxA,
        payment.id,
        'admin',
        'mistyped payment',
      );
      expect(reversal).not.toBeNull();
      expect(
        (
          await db
            .select()
            .from(invoicePayments)
            .where(eq(invoicePayments.invoiceId, ia!.id))
        ).map((x) => x.amountCents),
      ).toEqual([1000, -1000]);
      expect(
        await db
          .select()
          .from(invoicePaymentAuditEvents)
          .where(eq(invoicePaymentAuditEvents.organizationId, a!.id)),
      ).toHaveLength(2);
      expect(
        await repo.record(ctxB, ia!.id, 100, 'admin', 'foreign invoice'),
      ).toBeNull();
      expect(
        (await db.select().from(invoices).where(eq(invoices.id, ib!.id)))[0]
          ?.status,
      ).toBe('open');
    } finally {
      await db.delete(events).where(eq(events.slug, 'event'));
      await db
        .delete(organizations)
        .where(
          inArray(organizations.slug, [
            `price-a-${suffix}`,
            `price-b-${suffix}`,
          ]),
        );
      await pool.end();
    }
  });

  it('submits public registrations atomically and idempotently, then verifies one-time tokens with Cloud fixture tenant isolation', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    const [org] = await db
      .insert(organizations)
      .values({
        id: '10000000-0000-4000-8000-000000000001',
        slug: 'tenant-a',
        name: 'Public Registration',
        timezone: 'UTC',
        locale: 'en',
      })
      .returning();
    const orgId = organizationId(org!.id);
    let foreignOrgId: string | null = null;
    try {
      const termText = 'Terms configured by the event organizer.';
      const { createHash } = await import('node:crypto');
      const termHash = createHash('sha256').update(termText).digest('hex');
      const [event] = await db
        .insert(events)
        .values({
          organizationId: org!.id,
          id: '20000000-0000-4000-8000-000000000001',
          slug: `event-${suffix}`,
          name: 'E2E Event',
          startsOn: '2030-10-20',
          endsOn: '2030-10-21',
          status: 'open',
          consentTerms: [
            {
              key: 'terms',
              version: '2030.1',
              language: 'en',
              text: termText,
              hash: termHash,
            },
          ],
        })
        .returning();
      const classValues = ['A', 'B'].map((code) => ({
        organizationId: org!.id,
        eventId: event!.id,
        name: `Class ${code}`,
        code,
        vehicleType: 'car',
        sortOrder: code === 'A' ? 0 : 1,
        maxParticipants: 20,
      }));
      const classes = await db
        .insert(eventClasses)
        .values(classValues)
        .returning();
      const settingsRepository = createRegistrationSettingsRepository(db);
      const consentRepository = createEventConsentRepository(db);
      await db.insert(eventClassPricingRules).values(
        classes.map((eventClass) => ({
          organizationId: org!.id,
          eventId: event!.id,
          classId: eventClass.id,
          baseCents: 5000,
          additionalEntryAdjustmentCents: 0,
          earlyBirdDiscountCents: 0,
        })),
      );
      await saveMailTemplateVersion(db, org!.id, {
        templateKey: 'verification',
        version: 1,
        locale: 'en',
        subject: 'Verify',
        text: 'Verify: {{verificationUrl}}',
        html: '<a href="{{verificationUrl}}">Verify</a>',
      });
      const service = createPublicRegistrationService(db, {
        canonicalBaseUrl: 'https://racepilot.example.test',
      });
      const [foreignOrg] = await db
        .insert(organizations)
        .values({
          id: '10000000-0000-4000-8000-000000000002',
          slug: 'tenant-b',
          name: 'Foreign Tenant',
          timezone: 'UTC',
          locale: 'en',
        })
        .returning();
      foreignOrgId = foreignOrg!.id;
      const [foreignEvent] = await db
        .insert(events)
        .values({
          organizationId: foreignOrg!.id,
          id: '20000000-0000-4000-8000-000000000002',
          slug: `foreign-event-${suffix}`,
          name: 'Foreign Event',
          startsOn: '2030-10-20',
          endsOn: '2030-10-21',
          status: 'open',
        })
        .returning();
      const [foreignClass] = await db
        .insert(eventClasses)
        .values({
          organizationId: foreignOrg!.id,
          eventId: foreignEvent!.id,
          name: 'Foreign Class',
          code: 'F',
          vehicleType: 'car',
          sortOrder: 0,
          maxParticipants: 20,
        })
        .returning();
      const [foreignPerson] = await db
        .insert(people)
        .values({
          organizationId: foreignOrg!.id,
          firstName: 'Foreign',
          lastName: 'Person',
          email: 'foreign@example.test',
          emailNormalized: 'foreign@example.test',
          dateOfBirth: '1990-01-01',
        })
        .returning();
      const [foreignGroup] = await db
        .insert(registrationGroups)
        .values({
          organizationId: foreignOrg!.id,
          eventId: foreignEvent!.id,
          personId: foreignPerson!.id,
        })
        .returning();
      const foreignToken = 'tenant-b-verification-token';
      await db.insert(groupEmailVerifications).values({
        organizationId: foreignOrg!.id,
        eventId: foreignEvent!.id,
        registrationGroupId: foreignGroup!.id,
        tokenHash: createHash('sha256').update(foreignToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const input = (
        submissionId: string,
        person: {
          firstName: string;
          lastName: string;
          dateOfBirth: string;
          guardianName?: string;
          guardianEmail?: string;
          email?: string;
        },
      ) => ({
        submissionId,
        formVersion: '1.0' as const,
        eventSlug: event!.slug,
        language: 'en' as const,
        person: { ...person, email: person.email ?? 'family@example.test' },
        entries: classes.map((eventClass, index) => ({
          classId: eventClass.id,
          vehicle: {
            make: 'Maker',
            model: `Car ${index}`,
            year: 2020,
            registration: null,
          },
        })),
        consents: [
          {
            key: 'terms',
            version: '2030.1',
            hash: termHash,
            accepted: true as const,
          },
        ],
      });
      const ctx = {
        deploymentMode: 'cloud' as const,
        organizationId: orgId,
        permissions: new Set<string>(),
        capabilities: new Set<string>(),
        correlationId: 'test',
      };
      expect(await service.getForm(ctx, foreignEvent!.slug)).toBeNull();
      expect(await service.verify(ctx, foreignToken)).toBe(false);
      expect(
        (
          await db
            .select()
            .from(groupEmailVerifications)
            .where(eq(groupEmailVerifications.organizationId, foreignOrg!.id))
        ).at(0)?.consumedAt,
      ).toBeNull();
      const foreignClassPayload = {
        ...input(crypto.randomUUID(), {
          firstName: 'Cross',
          lastName: 'Tenant',
          dateOfBirth: '1990-01-01',
        }),
        entries: [
          {
            classId: foreignClass!.id,
            vehicle: {
              make: 'Make',
              model: 'Model',
              year: null,
              registration: null,
            },
          },
        ],
      };
      await expect(
        service.submit(ctx, event!.slug, foreignClassPayload),
      ).rejects.toThrow('Registration unavailable');
      expect(
        await db
          .select()
          .from(entries)
          .where(eq(entries.organizationId, foreignOrg!.id)),
      ).toHaveLength(0);
      const submissionId = crypto.randomUUID();
      const body = input(submissionId, {
        firstName: 'Avery',
        lastName: 'Driver',
        dateOfBirth: '1990-01-01',
      });
      expect(
        await Promise.all([
          service.submit(ctx, event!.slug, body),
          service.submit(ctx, event!.slug, body),
        ]),
      ).toEqual([
        { accepted: true, entryCount: 2 },
        { accepted: true, entryCount: 2 },
      ]);
      await expect(
        service.submit(ctx, event!.slug, {
          ...body,
          person: { ...body.person, firstName: 'Different' },
        }),
      ).rejects.toThrow('Submission ID conflict');
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Avery',
            lastName: 'Driver',
            dateOfBirth: '1990-01-01',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Avery',
            lastName: 'Driver',
            dateOfBirth: '1990-01-01',
            email: 'different-contact@example.test',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
      const groups = await db
        .select()
        .from(registrationGroups)
        .where(eq(registrationGroups.organizationId, org!.id));
      expect(groups).toHaveLength(1);
      const savedEntries = await db
        .select()
        .from(entries)
        .where(eq(entries.organizationId, org!.id));
      expect(savedEntries).toHaveLength(2);
      expect(
        savedEntries.every(
          (entry) =>
            entry.verificationStatus === 'unverified' &&
            entry.acceptanceStatus === 'pending',
        ),
      ).toBe(true);
      expect(
        await db
          .select()
          .from(invoices)
          .where(eq(invoices.organizationId, org!.id)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(consentEvidence)
          .where(eq(consentEvidence.organizationId, org!.id)),
      ).toHaveLength(1);
      const outbox = (
        await db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.organizationId, org!.id))
      )[0]!;
      const verificationUrl = outbox.variables.verificationUrl!;
      const token = new URL(verificationUrl).searchParams.get('token')!;
      expect(new URL(verificationUrl).origin).toBe(
        'https://racepilot.example.test',
      );
      const expiredToken = 'expired-verification-token';
      await db.insert(groupEmailVerifications).values({
        organizationId: org!.id,
        eventId: event!.id,
        registrationGroupId: groups[0]!.id,
        tokenHash: createHash('sha256').update(expiredToken).digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await service.verify(ctx, expiredToken)).toBe(false);
      expect(await service.verify(ctx, `${token}tampered`)).toBe(false);
      expect(
        (
          await db
            .select()
            .from(entries)
            .where(eq(entries.organizationId, org!.id))
        ).every((entry) => entry.verificationStatus === 'unverified'),
      ).toBe(true);
      expect(await service.verify(ctx, token)).toBe(true);
      expect(await service.verify(ctx, token)).toBe(false);
      expect(
        (
          await db
            .select()
            .from(entries)
            .where(eq(entries.organizationId, org!.id))
        ).every((entry) => entry.verificationStatus === 'verified'),
      ).toBe(true);
      expect(
        await db
          .select()
          .from(entryAuditEvents)
          .where(eq(entryAuditEvents.organizationId, org!.id)),
      ).toHaveLength(2);
      expect(await service.submit(ctx, event!.slug, body)).toEqual({
        accepted: true,
        entryCount: 2,
      });
      // A different person may use the same contact address with the default organization policy.
      await service.submit(
        ctx,
        event!.slug,
        input(crypto.randomUUID(), {
          firstName: 'Casey',
          lastName: 'Driver',
          dateOfBirth: '2000-02-02',
        }),
      );
      const newSettings = {
        sharedContactEmail: 'disallowed' as const,
        minimumAge: 16,
        guardianRequiredBelowAge: 18,
        maximumClassesPerGroup: 8,
      };
      await settingsRepository.update(ctx, newSettings, 'test-admin');
      expect(
        (
          await db
            .select()
            .from(registrationSettingsAudit)
            .where(eq(registrationSettingsAudit.organizationId, org!.id))
        ).at(-1)?.actor,
      ).toBe('test-admin');
      await consentRepository.update(
        ctx,
        event!.id,
        [
          {
            key: 'terms',
            version: '2030.1',
            language: 'en',
            text: termText,
            hash: termHash,
          },
        ],
        'test-admin',
      );
      expect(
        await db
          .select()
          .from(eventConsentTermsAudit)
          .where(eq(eventConsentTermsAudit.organizationId, org!.id)),
      ).toHaveLength(1);
      await settingsRepository.update(
        ctx,
        {
          sharedContactEmail: 'disallowed',
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        },
        'test-admin',
      );
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Morgan',
            lastName: 'Driver',
            dateOfBirth: '2001-03-03',
            email: 'FAMILY@example.test',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Minor',
            lastName: 'Driver',
            dateOfBirth: '2018-01-01',
            email: 'minor-no-guardian@example.test',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Minor',
            lastName: 'Driver',
            dateOfBirth: '2018-01-01',
            guardianName: 'Guardian',
            guardianEmail: 'guardian@example.test',
            email: 'minor-guardian@example.test',
          }),
        ),
      ).resolves.toMatchObject({ accepted: true });
      await settingsRepository.update(
        ctx,
        {
          sharedContactEmail: 'allowed',
          minimumAge: 16,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        },
        'test-admin',
      );
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Too Young',
            lastName: 'Driver',
            dateOfBirth: '2020-01-01',
            email: 'min-age@example.test',
            guardianName: 'Guardian',
            guardianEmail: 'guardian@example.test',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
      await settingsRepository.update(
        ctx,
        {
          sharedContactEmail: 'allowed',
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 1,
        },
        'test-admin',
      );
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Too Many Classes',
            lastName: 'Driver',
            dateOfBirth: '1990-01-01',
            email: 'too-many@example.test',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
      await settingsRepository.update(
        ctx,
        {
          sharedContactEmail: 'allowed',
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        },
        'test-admin',
      );
      await db
        .update(eventClasses)
        .set({ closed: true })
        .where(eq(eventClasses.id, classes[0]!.id));
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Closed Class',
            lastName: 'Driver',
            dateOfBirth: '1990-01-01',
            email: 'closed-class@example.test',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
      await db
        .update(eventClasses)
        .set({ closed: false })
        .where(eq(eventClasses.id, classes[0]!.id));
      const concurrentId = crypto.randomUUID();
      const concurrentPayloadA = input(concurrentId, {
        firstName: 'Concurrent A',
        lastName: 'Driver',
        dateOfBirth: '1990-01-01',
      });
      const concurrentPayloadB = {
        ...concurrentPayloadA,
        consents: [],
      };
      const concurrentResults = await Promise.allSettled([
        service.submit(ctx, event!.slug, concurrentPayloadA),
        service.submit(ctx, event!.slug, concurrentPayloadB),
      ]);
      expect(
        concurrentResults.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        concurrentResults.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect(
        concurrentResults.find((result) => result.status === 'rejected'),
      ).toMatchObject({
        reason: expect.objectContaining({ message: 'Submission ID conflict' }),
      });
      await db
        .update(events)
        .set({ registrationClosesAt: new Date(Date.now() - 1000) })
        .where(eq(events.id, event!.id));
      expect(await service.submit(ctx, event!.slug, body)).toEqual({
        accepted: true,
        entryCount: 2,
      });
      await expect(
        service.submit(ctx, event!.slug, {
          ...body,
          entries: body.entries.map((entry) => ({
            ...entry,
            vehicle: { ...entry.vehicle, model: 'Changed after close' },
          })),
        }),
      ).rejects.toThrow('Submission ID conflict');
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Late',
            lastName: 'Driver',
            dateOfBirth: '1990-01-01',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
      await db
        .update(events)
        .set({ status: 'closed' })
        .where(eq(events.id, event!.id));
      await expect(
        service.submit(
          ctx,
          event!.slug,
          input(crypto.randomUUID(), {
            firstName: 'Late',
            lastName: 'Driver',
            dateOfBirth: '1990-01-01',
          }),
        ),
      ).rejects.toThrow('Registration unavailable');
    } finally {
      if (foreignOrgId) {
        await db.delete(events).where(eq(events.organizationId, foreignOrgId));
        await db
          .delete(organizations)
          .where(eq(organizations.id, foreignOrgId));
      }
      await db.delete(emailOutbox).where(eq(emailOutbox.organizationId, orgId));
      await db.delete(events).where(eq(events.organizationId, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
      await pool.end();
    }
  });
  it('persists tenant-bound, versioned module activation with audit and no data loss', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [orgA, orgB] = await db
        .insert(organizations)
        .values(
          ['a', 'b'].map((n) => ({
            slug: `modules-${n}-${suffix}`,
            name: n,
            timezone: 'UTC',
            locale: 'en',
          })),
        )
        .returning();
      const ctxOf = (id: string) =>
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(id),
          permissions: new Set([
            'organization:read',
            'organization:update',
            'event:read',
            'event:write',
          ]),
          capabilities: new Set(),
          correlationId: 'modules',
        });
      const [eventA] = await db
        .insert(events)
        .values({
          organizationId: orgA!.id,
          slug: 'ev',
          name: 'A',
          startsOn: '2027-01-01',
          endsOn: '2027-01-02',
        })
        .returning();
      const [eventB] = await db
        .insert(events)
        .values({
          organizationId: orgB!.id,
          slug: 'ev',
          name: 'B',
          startsOn: '2027-01-01',
          endsOn: '2027-01-02',
        })
        .returning();
      const registry = createModuleRegistry([
        {
          manifest: {
            id: 'example.noop',
            version: '1.0.0',
            displayName: 'No-op',
            gallery: {
              name: { de: 'No-op', en: 'No-op' },
              shortDescription: { de: 'Beispielmodul', en: 'Example module' },
              longDescription: { de: 'Beispielmodul', en: 'Example module' },
              category: 'other',
              icon: 'puzzle',
              source: 'official',
              editions: ['community', 'cloud'],
              entitlement: 'included',
            },
            dependencies: [],
            permissions: [],
            capabilities: [],
            tables: [],
            migrations: [],
            routes: [],
            ui: [],
            jobs: [],
          },
          configSchema: {
            safeParse: (input) =>
              typeof input === 'object' && input !== null
                ? { success: true, data: input }
                : {
                    success: false,
                    error: { issues: [{ path: [], message: 'object' }] },
                  },
          },
          defaultConfig: { label: 'default' },
        },
      ]);
      const deps = {
        registry,
        activations: createModuleActivationRepository(db),
      };
      const a = ctxOf(orgA!.id);
      const b = ctxOf(orgB!.id);
      await expect(
        setEventModule(
          a,
          deps,
          eventA!.id,
          'example.noop',
          { enabled: true },
          'u',
        ),
      ).rejects.toMatchObject({ code: 'conflict' });
      await setOrganizationModule(
        a,
        deps,
        'example.noop',
        { enabled: true, config: { label: 'tpl' } },
        'u',
      );
      const enabled = await setEventModule(
        a,
        deps,
        eventA!.id,
        'example.noop',
        { enabled: true },
        'actor-1',
      );
      expect(enabled).toMatchObject({
        enabled: true,
        available: true,
        stateVersion: 1,
        config: { label: 'tpl' },
      });
      expect(
        (await resolveEventModuleAccess(a, deps, eventA!.id, 'example.noop'))
          ?.access,
      ).toBe('active');
      // idempotent repeat writes neither a version nor an audit row
      await setEventModule(
        a,
        deps,
        eventA!.id,
        'example.noop',
        { enabled: true },
        'actor-1',
      );
      await expect(
        setEventModule(
          a,
          deps,
          eventA!.id,
          'example.noop',
          { config: { label: 'x' }, expectedVersion: 9 },
          'u',
        ),
      ).rejects.toMatchObject({ code: 'conflict' });
      const off = await setEventModule(
        a,
        deps,
        eventA!.id,
        'example.noop',
        { enabled: false, reason: 'cancelled' },
        'actor-2',
      );
      expect(off).toMatchObject({
        enabled: false,
        stateVersion: 2,
        config: { label: 'tpl' },
      });
      expect(
        (await resolveEventModuleAccess(a, deps, eventA!.id, 'example.noop'))
          ?.access,
      ).toBe('archived');
      const audit = await db
        .select()
        .from(moduleActivationAudit)
        .where(
          and(
            eq(moduleActivationAudit.organizationId, orgA!.id),
            eq(moduleActivationAudit.eventId, eventA!.id),
          ),
        );
      expect(audit.map((r) => [r.action, r.version, r.actor]).sort()).toEqual([
        ['disable', 2, 'actor-2'],
        ['enable', 1, 'actor-1'],
      ]);
      // tenant isolation: org B sees none of it, foreign event ids are not found
      expect(await listEventModules(b, deps, eventA!.id)).toBeNull();
      expect(
        await setEventModule(
          b,
          deps,
          eventA!.id,
          'example.noop',
          { enabled: true },
          'u',
        ),
      ).toBeNull();
      expect(
        await resolveEventModuleAccess(b, deps, eventA!.id, 'example.noop'),
      ).toBeNull();
      expect(await listEventModules(b, deps, 'not-a-uuid')).toBeNull();
      expect((await listEventModules(b, deps, eventB!.id))?.[0]).toMatchObject({
        enabled: false,
        stateVersion: null,
      });
      expect(await deps.activations.listOrganization(b)).toEqual([]);
      // a row cannot point at another organization's event
      await expect(
        db.insert(eventModules).values({
          organizationId: orgB!.id,
          eventId: eventA!.id,
          moduleId: 'example.noop',
          enabled: true,
          config: {},
          version: 1,
          moduleVersion: '1.0.0',
          updatedBy: 'x',
        }),
      ).rejects.toThrow();
      // module state is removed only with its event, never by deactivation
      expect(
        await db
          .select()
          .from(eventModules)
          .where(eq(eventModules.eventId, eventA!.id)),
      ).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });
});
