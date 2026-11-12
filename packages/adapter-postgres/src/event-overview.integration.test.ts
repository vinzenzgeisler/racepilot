import { runMigrations } from 'graphile-worker';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createRequestContext,
  defaultEntryWorkflow,
  organizationId,
} from '@racepilot/core';
import { createDatabase, migrate } from './database-service.js';
import { createOverviewRepository } from './event-overview.js';
import { createEntryWorkflowRepository } from './entry-workflow.js';
import { organizations, events, eventClasses } from './schema/organization.js';
import {
  people,
  vehicles,
  registrationGroups,
  entries,
} from './schema/entries.js';
import { invoices } from './schema/billing.js';
import { eventEntryDocumentTypes } from './schema/documents.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL event overview', () => {
  it('aggregates counts, capacity, outstanding cents, warnings and enforces organization isolation', async () => {
    await migrate(url!);
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    let organizationIdForCleanup: string | undefined;
    try {
      const [organization] = await db
        .insert(organizations)
        .values({
          slug: `overview-${suffix}`,
          name: 'Overview',
          timezone: 'UTC',
          locale: 'en',
          currency: 'EUR',
        })
        .returning();
      organizationIdForCleanup = organization!.id;
      const [event] = await db
        .insert(events)
        .values({
          organizationId: organizationIdForCleanup,
          slug: `overview-${suffix}`,
          name: 'Race',
          startsOn: '2030-01-01',
          endsOn: '2030-01-02',
          status: 'open',
          registrationClosesAt: new Date('2030-01-01T00:00:00.000Z'),
        })
        .returning();
      await db.insert(eventEntryDocumentTypes).values({
        organizationId: organizationIdForCleanup,
        eventId: event!.id,
        key: 'license',
        name: 'Driver license',
        required: true,
      });
      const [eventClass] = await db
        .insert(eventClasses)
        .values({
          organizationId: organizationIdForCleanup,
          eventId: event!.id,
          name: 'GT',
          code: `GT-${suffix}`,
          vehicleType: 'car',
          maxParticipants: 4,
        })
        .returning();
      const [person] = await db
        .insert(people)
        .values({
          organizationId: organizationIdForCleanup,
          firstName: 'Ada',
          lastName: 'Driver',
          email: 'ada@example.test',
          emailNormalized: 'ada@example.test',
        })
        .returning();
      const [vehicle] = await db
        .insert(vehicles)
        .values({
          organizationId: organizationIdForCleanup,
          make: 'Race',
          model: 'Car',
        })
        .returning();
      const [group] = await db
        .insert(registrationGroups)
        .values({
          organizationId: organizationIdForCleanup,
          eventId: event!.id,
          personId: person!.id,
        })
        .returning();
      await db.insert(entries).values({
        organizationId: organizationIdForCleanup,
        eventId: event!.id,
        classId: eventClass!.id,
        registrationGroupId: group!.id,
        driverPersonId: person!.id,
        vehicleId: vehicle!.id,
        orgaCode: `OVR-${suffix}`,
        acceptanceStatus: 'pending',
        verificationStatus: 'unverified',
      });
      await db.insert(invoices).values({
        organizationId: organizationIdForCleanup,
        eventId: event!.id,
        registrationGroupId: group!.id,
        totalCents: 1450,
        currency: 'EUR',
        paymentReference: `RP-${suffix}`,
        status: 'open',
      });
      const ctx = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(organizationIdForCleanup),
        permissions: new Set(['entry:read']),
        capabilities: new Set(),
        correlationId: suffix,
      });
      const workflow = {
        ...defaultEntryWorkflow,
        statuses: defaultEntryWorkflow.statuses.map((status) =>
          status.key === 'pending'
            ? { ...status, category: 'accepted' as const }
            : status,
        ),
      };
      const revision = await createEntryWorkflowRepository(db).setEvent(
        ctx,
        event!.id,
        workflow,
        'overview-test',
        'Test workflow category projection',
      );
      if (!revision) throw new Error('Event workflow was not initialized');
      await db
        .update(entries)
        .set({ workflowRevisionId: revision.id })
        .where(eq(entries.eventId, event!.id));
      const repository = createOverviewRepository(db);
      const result = await repository.getEventOverview(
        ctx,
        event!.id,
        new Date('2029-12-31T00:00:00.000Z'),
      );
      expect(result).toMatchObject({
        ok: true,
        overview: {
          statuses: { accepted: 1 },
          openPayments: { count: 1, amountCents: 1450, currency: 'EUR' },
          classes: [
            { classId: eventClass!.id, name: 'GT', occupied: 1, capacity: 4 },
          ],
          daysUntilRegistrationCloses: 1,
          missingDocuments: { count: 1 },
          warnings: [
            {
              type: 'unverified-email',
              count: 1,
              filter: { eventId: event!.id, verificationStatus: 'unverified' },
            },
          ],
        },
      });
      const foreignCtx = createRequestContext({
        ...ctx,
        organizationId: organizationId('99999999-9999-4999-8999-999999999999'),
      });
      expect(
        await repository.getEventOverview(foreignCtx, event!.id, new Date()),
      ).toEqual({
        ok: false,
        error: 'event-not-found',
      });
    } finally {
      if (organizationIdForCleanup) {
        await db
          .delete(events)
          .where(eq(events.organizationId, organizationIdForCleanup));
        await db
          .delete(organizations)
          .where(eq(organizations.id, organizationIdForCleanup));
      }
      await pool.end();
    }
  });
});
