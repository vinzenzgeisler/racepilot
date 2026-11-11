import { runMigrations } from 'graphile-worker';
import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createRequestContext, organizationId } from '@racepilot/core';
import { createDatabase, migrate } from './database-service.js';
import { createMessageRepository } from './messaging-repository.js';
import { emailOutbox } from './mail-schema.js';
import {
  messageCampaigns,
  messageCampaignRecipients,
} from './messaging-schema.js';
import { organizations, events, eventClasses } from './schema/organization.js';
import { invoices } from './schema/billing.js';
import {
  entries,
  people,
  registrationGroups,
  vehicles,
} from './schema/entries.js';

const databaseUrl = process.env.RACEPILOT_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('messaging PostgreSQL integration', () => {
  it('isolates organizations and makes sends idempotent', async () => {
    await migrate(databaseUrl!);
    await runMigrations({ connectionString: databaseUrl! });
    const { db, pool } = await createDatabase(databaseUrl!);
    const suffix = crypto.randomUUID();
    const orgIds: string[] = [];
    const eventIds: string[] = [];
    try {
      const seed = async (label: string) => {
        const [org] = await db
          .insert(organizations)
          .values({
            slug: `messages-${label}-${suffix}`,
            name: label,
            timezone: 'UTC',
            locale: 'en',
          })
          .returning();
        orgIds.push(org!.id);
        const [event] = await db
          .insert(events)
          .values({
            organizationId: org!.id,
            slug: 'event',
            name: `Event ${label}`,
            startsOn: '2030-01-01',
            endsOn: '2030-01-01',
          })
          .returning();
        eventIds.push(event!.id);
        const [eventClass] = await db
          .insert(eventClasses)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            name: 'Open',
            code: 'OPEN',
            vehicleType: 'car',
          })
          .returning();
        const [person] = await db
          .insert(people)
          .values({
            organizationId: org!.id,
            firstName: 'Ada',
            lastName: label,
            email: `ada-${label}@example.test`,
          })
          .returning();
        const [vehicle] = await db
          .insert(vehicles)
          .values({ organizationId: org!.id, make: 'Test', model: 'Car' })
          .returning();
        const [group] = await db
          .insert(registrationGroups)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            personId: person!.id,
            contactEmail: person!.email,
          })
          .returning();
        const [entry] = await db
          .insert(entries)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            classId: eventClass!.id,
            registrationGroupId: group!.id,
            driverPersonId: person!.id,
            vehicleId: vehicle!.id,
          })
          .returning();
        return { org: org!, event: event!, entry: entry!, group: group! };
      };
      const owner = await seed('owner');
      const foreign = await seed('foreign');
      const context = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(owner.org.id),
        permissions: new Set(['entry:read', 'event:write']),
        capabilities: new Set(),
        correlationId: suffix,
      });
      const repo = createMessageRepository(
        db,
        undefined,
        'https://example.test',
      );
      const foreignContext = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(foreign.org.id),
        permissions: new Set(['entry:read', 'event:write']),
        capabilities: new Set(),
        correlationId: `${suffix}-foreign`,
      });
      const filter: Parameters<typeof repo.preview>[2] = {
        classIds: [],
        statuses: [],
        payment: 'any',
        entryIds: [],
        additionalAddresses: [],
      };
      expect(await repo.preview(context, foreign.event.id, filter)).toBeNull();
      expect(
        await repo.preview(foreignContext, owner.event.id, filter),
      ).toBeNull();
      const templates = await repo.listTemplates(context, owner.event.id);
      expect(templates).toEqual([
        expect.objectContaining({
          eventId: owner.event.id,
          name: 'General update',
          subject: 'An update about {{eventName}}',
        }),
      ]);
      expect(await repo.listTemplates(context, owner.event.id)).toHaveLength(1);
      const preview = await repo.preview(context, owner.event.id, filter);
      expect(preview).toMatchObject({
        count: 1,
        recipients: [
          { email: `ada-owner@example.test`, entryId: owner.entry.id },
        ],
      });
      const payload = {
        eventId: owner.event.id,
        recipients: filter,
        subject: 'Hello {{firstName}}',
        text: 'Welcome {{eventName}}',
        attachments: [],
      };
      expect(
        await repo.send(
          foreignContext,
          owner.event.id,
          'foreign-test-key',
          payload,
          'integration-test',
        ),
      ).toBeNull();
      const first = await repo.send(
        context,
        owner.event.id,
        `send-${suffix}`,
        payload,
        'integration-test',
      );
      const replay = await repo.send(
        context,
        owner.event.id,
        `send-${suffix}`,
        payload,
        'integration-test',
      );
      expect(first).toMatchObject({ total: 1, status: 'sending' });
      expect(replay).toMatchObject({ id: first?.id });
      expect(
        await repo.send(
          context,
          owner.event.id,
          `send-${suffix}`,
          { ...payload, subject: 'different' },
          'integration-test',
        ),
      ).toBeNull();
      const campaigns = await db
        .select()
        .from(messageCampaigns)
        .where(
          and(
            eq(messageCampaigns.organizationId, owner.org.id),
            eq(messageCampaigns.eventId, owner.event.id),
          ),
        );
      const recipients = await db
        .select()
        .from(messageCampaignRecipients)
        .where(eq(messageCampaignRecipients.organizationId, owner.org.id));
      const outbox = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, owner.org.id));
      expect(campaigns).toHaveLength(1);
      expect(recipients).toHaveLength(1);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.variables).toMatchObject({
        subject: 'Hello Ada',
        body: 'Welcome Event owner',
      });
      const sentCampaign = first;
      if (!sentCampaign) throw new Error('Campaign was not created');
      await db
        .update(messageCampaigns)
        .set({ status: 'failed' })
        .where(eq(messageCampaigns.id, sentCampaign.id));
      await db
        .update(messageCampaignRecipients)
        .set({ status: 'failed' })
        .where(eq(messageCampaignRecipients.campaignId, sentCampaign.id));
      await db
        .update(emailOutbox)
        .set({ status: 'failed' })
        .where(eq(emailOutbox.id, outbox[0]!.id));
      const retried = await repo.retryFailed(context, sentCampaign.id);
      expect(retried).toMatchObject({ status: 'sending', failed: 0 });
      const verification = await repo.quickAction(
        context,
        owner.event.id,
        'resend-verification',
        'integration-test',
      );
      expect(verification).toMatchObject({ status: 'sending', total: 1 });
      await db.insert(invoices).values({
        organizationId: owner.org.id,
        eventId: owner.event.id,
        registrationGroupId: owner.group.id,
        totalCents: 2500,
        currency: 'EUR',
        paymentReference: `payment-${suffix}`,
      });
      const paymentReminder = await repo.quickAction(
        context,
        owner.event.id,
        'remind-open-payments',
        'integration-test',
      );
      expect(paymentReminder).toMatchObject({ status: 'sending', total: 1 });
      const allCampaigns = await db
        .select()
        .from(messageCampaigns)
        .where(eq(messageCampaigns.organizationId, owner.org.id));
      const allRecipients = await db
        .select()
        .from(messageCampaignRecipients)
        .where(eq(messageCampaignRecipients.organizationId, owner.org.id));
      const allOutbox = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, owner.org.id));
      expect(allCampaigns).toHaveLength(3);
      expect(allRecipients).toHaveLength(3);
      expect(allOutbox).toHaveLength(3);
      expect(await repo.list(context, foreign.event.id)).toBeNull();
    } finally {
      if (orgIds.length) {
        await db
          .delete(messageCampaigns)
          .where(inArray(messageCampaigns.organizationId, orgIds));
        await db
          .delete(emailOutbox)
          .where(inArray(emailOutbox.organizationId, orgIds));
      }
      if (eventIds.length)
        await db.delete(events).where(inArray(events.id, eventIds));
      if (orgIds.length)
        await db.delete(organizations).where(inArray(organizations.id, orgIds));
      await pool.end();
    }
  });
});
