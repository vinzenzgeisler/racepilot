import { runMigrations } from 'graphile-worker';
import {
  calculatePrice,
  createRequestContext,
  organizationId,
} from '@racepilot/core';
import { describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import {
  createDatabase,
  migrate,
  createEntryAdminActionsRepository,
  createEntryRepository,
  createEntryWorkflowRepository,
  entryAdminActionAuditEvents,
  entryAmountAdjustments,
  entries,
  entryNotes,
  eventClassPricingRules,
  eventClasses,
  events,
  invoices,
  invoicePayments,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from './index.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;

describe.skipIf(!url)('entry admin actions', () => {
  it('enforces tenant/version/capacity, recalculates price, audits notes and soft-deletes', async () => {
    if (!url) throw new Error('RACEPILOT_TEST_DATABASE_URL is required');
    await migrate(url);
    await runMigrations({ connectionString: url });
    const { db, pool } = await createDatabase(url);
    const suffix = crypto.randomUUID();
    const organizationIds: string[] = [];
    const eventIds: string[] = [];
    try {
      const seedOrganization = async (label: string) => {
        const [organization] = await db
          .insert(organizations)
          .values({
            slug: `admin-actions-${label}-${suffix}`,
            name: label,
            timezone: 'UTC',
            locale: 'de',
          })
          .returning();
        if (!organization) throw new Error('Organization seed failed');
        organizationIds.push(organization.id);
        const context = createRequestContext({
          deploymentMode: 'community',
          organizationId: organizationId(organization.id),
          permissions: new Set(['entry:read', 'entry:write']),
          capabilities: new Set(),
          correlationId: suffix,
        });
        const [event] = await db
          .insert(events)
          .values({
            organizationId: organization.id,
            slug: 'event',
            name: 'Bergpreis',
            startsOn: '2030-01-01',
            endsOn: '2030-01-01',
          })
          .returning();
        if (!event) throw new Error('Event seed failed');
        eventIds.push(event.id);
        const [sourceClass] = await db
          .insert(eventClasses)
          .values({
            organizationId: organization.id,
            eventId: event.id,
            name: 'Source',
            code: 'SRC',
            vehicleType: 'car',
          })
          .returning();
        const [targetClass] = await db
          .insert(eventClasses)
          .values({
            organizationId: organization.id,
            eventId: event.id,
            name: 'Target',
            code: 'TGT',
            vehicleType: 'car',
            maxParticipants: 2,
          })
          .returning();
        if (!sourceClass || !targetClass) throw new Error('Class seed failed');
        await db.insert(eventClassPricingRules).values([
          {
            organizationId: organization.id,
            eventId: event.id,
            classId: sourceClass.id,
            baseCents: 5000,
            additionalEntryAdjustmentCents: 0,
            earlyBirdDiscountCents: 0,
          },
          {
            organizationId: organization.id,
            eventId: event.id,
            classId: targetClass.id,
            baseCents: 7500,
            additionalEntryAdjustmentCents: 0,
            earlyBirdDiscountCents: 0,
          },
        ]);
        const [person] = await db
          .insert(people)
          .values({
            organizationId: organization.id,
            firstName: 'Test',
            lastName: label,
            email: `${label}@example.test`,
          })
          .returning();
        if (!person) throw new Error('Person seed failed');
        const makeEntry = async (serial: number) => {
          const [vehicle] = await db
            .insert(vehicles)
            .values({
              organizationId: organization.id,
              make: 'Race',
              model: `Car ${serial}`,
            })
            .returning();
          if (!vehicle) throw new Error('Vehicle seed failed');
          const [group] = await db
            .insert(registrationGroups)
            .values({
              organizationId: organization.id,
              eventId: event.id,
              personId: person.id,
            })
            .returning();
          if (!group) throw new Error('Group seed failed');
          const snapshot = calculatePrice({
            currency: 'EUR',
            submittedAt: '2030-01-01T00:00:00.000Z',
            lines: [
              {
                classId: sourceClass.id,
                quantity: 1,
                rule: {
                  classId: sourceClass.id,
                  baseCents: 5000,
                  additionalEntryAdjustmentCents: 0,
                  earlyBirdDeadline: null,
                  earlyBirdDiscountCents: 0,
                },
              },
            ],
          });
          const [entry] = await db
            .insert(entries)
            .values({
              organizationId: organization.id,
              eventId: event.id,
              classId: sourceClass.id,
              registrationGroupId: group.id,
              driverPersonId: person.id,
              vehicleId: vehicle.id,
              orgaCode: `TEST-${crypto.randomUUID()}`,
              priceSnapshotVersion: snapshot.version,
              priceSnapshot: snapshot,
            })
            .returning();
          if (!entry) throw new Error('Entry seed failed');
          const [invoice] = await db
            .insert(invoices)
            .values({
              organizationId: organization.id,
              eventId: event.id,
              registrationGroupId: group.id,
              totalCents: snapshot.totalCents,
              currency: 'EUR',
              paymentReference: 'TEST-' + label + '-' + serial + '-' + suffix,
            })
            .returning();
          if (!invoice) throw new Error('Invoice seed failed');
          await db.insert(invoicePayments).values({
            organizationId: organization.id,
            invoiceId: invoice.id,
            amountCents: 1000,
            actor: 'seed',
            reason: 'test payment',
          });
          return entry;
        };
        return {
          context,
          organization,
          sourceClass,
          targetClass,
          entries: [await makeEntry(1), await makeEntry(2), await makeEntry(3)],
        };
      };
      const tenantA = await seedOrganization('a');
      const tenantB = await seedOrganization('b');
      const actions = createEntryAdminActionsRepository(db);
      const entryRepository = createEntryRepository(db);
      const pinned = await createEntryWorkflowRepository(db).getPinnedForEntry(
        tenantA.context,
        tenantA.entries[0]?.id ?? '',
      );
      expect(pinned?.workflow.transitions).toContainEqual(
        expect.objectContaining({
          from: 'withdrawn',
          to: 'pending',
          reasonRequired: true,
          reopen: true,
          notify: true,
        }),
      );
      const [move, concurrentA, concurrentB] = tenantA.entries;
      if (!move || !concurrentA || !concurrentB)
        throw new Error('Entry seed missing');
      expect(
        await actions.availableActions(tenantA.context, move.id),
      ).toContain(`change_class:${tenantA.targetClass.id}`);

      expect(
        await actions.perform(
          tenantB.context,
          move.id,
          {
            kind: 'delete',
            reason: 'foreign',
            expectedVersion: 1,
          },
          'tenant-b',
        ),
      ).toEqual({ status: 'not_found' });

      const moved = await actions.perform(
        tenantA.context,
        move.id,
        {
          kind: 'change_class',
          classId: tenantA.targetClass.id,
          reason: 'Klassenwechsel',
          expectedVersion: 1,
        },
        'admin-a',
      );
      expect(moved).toEqual({ status: 'updated' });
      const changedEntry = await entryRepository.getById(
        tenantA.context,
        move.id,
      );
      expect(changedEntry).toMatchObject({
        classId: tenantA.targetClass.id,
        revision: 2,
        priceSnapshot: { totalCents: 7500 },
      });

      const concurrentResults = await Promise.all([
        actions.perform(
          tenantA.context,
          concurrentA.id,
          {
            kind: 'change_class',
            classId: tenantA.targetClass.id,
            reason: 'Kapazitätstest',
            expectedVersion: 1,
          },
          'admin-a',
        ),
        actions.perform(
          tenantA.context,
          concurrentB.id,
          {
            kind: 'change_class',
            classId: tenantA.targetClass.id,
            reason: 'Kapazitätstest',
            expectedVersion: 1,
          },
          'admin-a',
        ),
      ]);
      expect(concurrentResults.map((result) => result.status).sort()).toEqual([
        'conflict',
        'updated',
      ]);
      expect(concurrentResults).toContainEqual({
        status: 'conflict',
        reason: 'capacity',
      });
      const remainingEntry =
        concurrentResults[0]?.status === 'conflict' ? concurrentA : concurrentB;
      expect(
        await actions.availableActions(tenantA.context, remainingEntry.id),
      ).not.toContain(`change_class:${tenantA.targetClass.id}`);

      const adjusted = await actions.perform(
        tenantA.context,
        move.id,
        {
          kind: 'adjust_amount',
          amountCents: 6000,
          reason: 'Kulanzrabatt',
          expectedVersion: 2,
        },
        'admin-a',
      );
      expect(adjusted).toEqual({ status: 'updated' });
      const [adjustment] = await db
        .select()
        .from(entryAmountAdjustments)
        .where(
          and(
            eq(entryAmountAdjustments.organizationId, tenantA.organization.id),
            eq(entryAmountAdjustments.entryId, move.id),
          ),
        );
      expect(adjustment).toMatchObject({
        originalCents: 7500,
        adjustedCents: 6000,
      });
      const [updatedInvoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.registrationGroupId, move.registrationGroupId));
      expect(updatedInvoice?.totalCents).toBe(6000);
      if (!updatedInvoice) throw new Error('Updated invoice missing');
      const recordedPayments = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, updatedInvoice.id));
      expect(recordedPayments.map((payment) => payment.amountCents)).toEqual([
        1000,
      ]);

      await actions.perform(
        tenantA.context,
        move.id,
        { kind: 'note', visibility: 'internal', text: 'Only organization' },
        'admin-a',
      );
      await actions.perform(
        tenantA.context,
        move.id,
        {
          kind: 'note',
          visibility: 'driver',
          text: 'Bitte Unterlagen mitbringen',
        },
        'admin-a',
      );
      const notes = await db
        .select()
        .from(entryNotes)
        .where(eq(entryNotes.entryId, move.id));
      expect(notes.map((note) => [note.visibility, note.actor])).toEqual([
        ['internal', 'admin-a'],
        ['driver', 'admin-a'],
      ]);

      const deletes = await Promise.all([
        actions.perform(
          tenantA.context,
          move.id,
          { kind: 'delete', reason: 'Doppelnennung', expectedVersion: 3 },
          'admin-a',
        ),
        actions.perform(
          tenantA.context,
          move.id,
          { kind: 'delete', reason: 'Doppelnennung', expectedVersion: 3 },
          'admin-a',
        ),
      ]);
      expect(deletes.map((result) => result.status).sort()).toEqual([
        'conflict',
        'updated',
      ]);
      expect(deletes).toContainEqual({ status: 'conflict', reason: 'stale' });
      expect(
        await entryRepository.getById(tenantA.context, move.id),
      ).toBeNull();
      const history = await db
        .select()
        .from(entryAdminActionAuditEvents)
        .where(eq(entryAdminActionAuditEvents.entryId, move.id));
      expect(history.map((item) => item.action)).toEqual([
        'class_changed',
        'amount_adjusted',
        'deleted',
      ]);
      expect(
        await db
          .select()
          .from(entryNotes)
          .where(eq(entryNotes.organizationId, tenantB.organization.id)),
      ).toHaveLength(0);
    } finally {
      if (eventIds.length)
        await db.delete(events).where(inArray(events.id, eventIds));
      if (organizationIds.length)
        await db
          .delete(organizations)
          .where(inArray(organizations.id, organizationIds));
      await pool.end();
    }
  });
});
