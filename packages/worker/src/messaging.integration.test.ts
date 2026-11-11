import { and, eq } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { describe, expect, it } from 'vitest';
import {
  createRequestContext,
  createJobContext,
  organizationId,
} from '@racepilot/core';
import {
  createDatabase,
  createEntryDetailRepository,
  createMailOutboxRepository,
  createMessageRepository,
  emailOutbox,
  messageCampaigns,
  messageCampaignRecipients,
} from '@racepilot/adapter-postgres';
import {
  events,
  organizations,
  eventClasses,
} from '@racepilot/adapter-postgres';
import {
  entries,
  people,
  registrationGroups,
  vehicles,
} from '@racepilot/adapter-postgres';
import { migrate } from '@racepilot/adapter-postgres';
import { processMailOutboxJob } from './mail.js';

const databaseUrl = process.env.RACEPILOT_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)(
  'message campaign mail delivery integration',
  () => {
    it('sends campaign mail through the outbox and marks entry and campaign status sent', async () => {
      await migrate(databaseUrl!);
      await runMigrations({ connectionString: databaseUrl! });
      const { db, pool } = await createDatabase(databaseUrl!);
      const suffix = crypto.randomUUID();
      let orgId: string | undefined;
      let eventId: string | undefined;
      try {
        const [org] = await db
          .insert(organizations)
          .values({
            slug: `message-worker-${suffix}`,
            name: 'Message worker',
            timezone: 'UTC',
            locale: 'en',
            mailFrom: 'club@example.test',
          })
          .returning();
        orgId = org!.id;
        const [event] = await db
          .insert(events)
          .values({
            organizationId: orgId,
            slug: 'event',
            name: 'Worker Run',
            startsOn: '2030-01-01',
            endsOn: '2030-01-01',
          })
          .returning();
        eventId = event!.id;
        const [eventClass] = await db
          .insert(eventClasses)
          .values({
            organizationId: orgId,
            eventId: eventId,
            name: 'Open',
            code: 'OPEN',
            vehicleType: 'car',
          })
          .returning();
        const [person] = await db
          .insert(people)
          .values({
            organizationId: orgId,
            firstName: 'Ada',
            lastName: 'Driver',
            email: 'ada-worker@example.test',
          })
          .returning();
        const [vehicle] = await db
          .insert(vehicles)
          .values({ organizationId: orgId, make: 'Test', model: 'Car' })
          .returning();
        const [group] = await db
          .insert(registrationGroups)
          .values({
            organizationId: orgId,
            eventId: eventId,
            personId: person!.id,
            contactEmail: person!.email,
          })
          .returning();
        await db.insert(entries).values({
          organizationId: orgId,
          eventId: eventId,
          classId: eventClass!.id,
          registrationGroupId: group!.id,
          driverPersonId: person!.id,
          vehicleId: vehicle!.id,
          orgaCode: `TEST-${crypto.randomUUID()}`,
        });
        const requestContext = createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(orgId),
          permissions: new Set(['entry:read', 'event:write']),
          capabilities: new Set(),
          correlationId: suffix,
        });
        const sendResult = await createMessageRepository(db).send(
          requestContext,
          eventId,
          `key-${suffix}`,
          {
            eventId,
            recipients: {
              classIds: [],
              statuses: [],
              payment: 'any',
              entryIds: [],
              additionalAddresses: [],
            },
            subject: 'Hello {{firstName}}',
            text: 'Welcome {{eventName}}',
            attachments: [],
          },
          'worker-test',
        );
        if (!sendResult.ok) throw new Error('Campaign send failed');
        const campaign = sendResult.campaign.campaign;
        expect(sendResult.campaign.recipients).toHaveLength(1);
        expect(campaign.status).toBe('sending');
        const [outbox] = await db
          .select()
          .from(emailOutbox)
          .where(
            and(
              eq(emailOutbox.organizationId, orgId),
              eq(emailOutbox.templateKey, 'message-campaign'),
            ),
          );
        const jobContext = createJobContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(orgId),
          jobId: suffix,
          correlationId: suffix,
        });
        const sent: string[] = [];
        await processMailOutboxJob({
          ctx: jobContext,
          outboxId: outbox!.id,
          deps: {
            repository: createMailOutboxRepository(db),
            mail: {
              send: async (mail) => {
                sent.push(`${mail.subject}|${mail.text}`);
              },
            },
          },
        });
        expect(sent).toEqual(['Hello Ada|Welcome Worker Run']);
        const [updatedCampaign] = await db
          .select()
          .from(messageCampaigns)
          .where(eq(messageCampaigns.id, campaign.id));
        const [recipient] = await db
          .select()
          .from(messageCampaignRecipients)
          .where(eq(messageCampaignRecipients.campaignId, campaign.id));
        expect(updatedCampaign?.status).toBe('sent');
        expect(recipient?.status).toBe('sent');
        const detailMessages = await createEntryDetailRepository(
          db,
        ).listMessages(requestContext, recipient!.entryId!);
        expect(detailMessages?.[0]).toMatchObject({
          subject: 'Hello Ada',
          status: 'sent',
        });
      } finally {
        if (orgId) {
          await db
            .delete(messageCampaigns)
            .where(eq(messageCampaigns.organizationId, orgId));
          await db
            .delete(emailOutbox)
            .where(eq(emailOutbox.organizationId, orgId));
        }
        if (eventId) await db.delete(events).where(eq(events.id, eventId));
        if (orgId)
          await db.delete(organizations).where(eq(organizations.id, orgId));
        await pool.end();
      }
    });
  },
);
