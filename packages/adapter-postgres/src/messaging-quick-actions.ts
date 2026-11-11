import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestContext } from '@racepilot/core';
import {
  MESSAGE_VERIFICATION_TOKEN_TTL_MS,
  transitionMessageCampaign,
} from '@racepilot/core';
import type { MessageCampaignCreate } from '@racepilot/core';
import type { Database } from './database.js';
import { entries, people, registrationGroups } from './schema/entries.js';
import { events, organizations } from './schema/organization.js';
import { groupEmailVerifications } from './schema/public-registration.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import {
  messageCampaignAudits,
  messageCampaignRecipients,
  messageCampaigns,
} from './messaging-schema.js';
import { createMessageSender } from './messaging-send.js';
import {
  digestMessage,
  messageCampaignResponse,
  messageLocale,
} from './messaging-utils.js';

export type MessageQuickAction = 'resend-verification' | 'remind-open-payments';

export function createMessageQuickActions(
  db: Database,
  canonicalBaseUrl: string | undefined,
) {
  const send = createMessageSender(db);
  return async (
    ctx: RequestContext,
    eventId: string,
    action: MessageQuickAction,
    actor: string,
  ) => {
    if (action === 'remind-open-payments') {
      const input: MessageCampaignCreate = {
        eventId,
        recipients: {
          classIds: [],
          statuses: [],
          payment: 'open',
          entryIds: [],
          additionalAddresses: [],
        },
        subject: 'Payment reminder for {{eventName}}',
        text: 'This is a reminder that a payment for {{eventName}} is still open. Please review your payment details.',
        attachments: [],
      };
      return send(
        ctx,
        eventId,
        `quick-action:open-payments:${crypto.randomUUID()}`,
        input,
        actor,
      );
    }
    if (!canonicalBaseUrl) return null;
    const rows = await db
      .select({
        groupId: registrationGroups.id,
        entryId: entries.id,
        email: sql<
          string | null
        >`coalesce(${registrationGroups.contactEmail}, ${registrationGroups.guardianEmail}, ${people.email})`,
        firstName: people.firstName,
        lastName: people.lastName,
      })
      .from(entries)
      .innerJoin(
        registrationGroups,
        and(
          eq(registrationGroups.organizationId, entries.organizationId),
          eq(registrationGroups.eventId, entries.eventId),
          eq(registrationGroups.id, entries.registrationGroupId),
        ),
      )
      .innerJoin(
        people,
        and(
          eq(people.organizationId, entries.organizationId),
          eq(people.id, entries.driverPersonId),
        ),
      )
      .innerJoin(
        events,
        and(
          eq(events.organizationId, entries.organizationId),
          eq(events.id, entries.eventId),
        ),
      )
      .where(
        and(
          eq(entries.organizationId, ctx.organizationId),
          eq(entries.eventId, eventId),
          eq(entries.verificationStatus, 'unverified'),
          isNull(entries.deletedAt),
        ),
      )
      .orderBy(entries.createdAt);
    const recipients = new Map<
      string,
      (typeof rows)[number] & { email: string }
    >();
    for (const row of rows)
      if (row.email && !recipients.has(row.groupId))
        recipients.set(row.groupId, { ...row, email: row.email });
    if (!recipients.size) return null;

    return db.transaction(async (tx) => {
      const key = `quick-action:verification:${crypto.randomUUID()}`;
      const sendingStatus = transitionMessageCampaign('planned', 'sending');
      const [campaign] = await tx
        .insert(messageCampaigns)
        .values({
          organizationId: ctx.organizationId,
          eventId,
          idempotencyKey: key,
          requestHash: createHash('sha256').update(key).digest('hex'),
          subject: 'Verify your email address',
          textBody:
            'Follow the verification link to confirm your email address.',
          status: sendingStatus,
          actor,
        })
        .returning();
      if (!campaign) return null;
      await tx.insert(messageCampaignAudits).values({
        organizationId: ctx.organizationId,
        campaignId: campaign.id,
        actor,
        action,
      });
      const [organization] = await tx
        .select({ locale: organizations.locale })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId))
        .limit(1);
      for (const [groupId, recipient] of recipients) {
        await tx
          .update(groupEmailVerifications)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(groupEmailVerifications.organizationId, ctx.organizationId),
              eq(groupEmailVerifications.eventId, eventId),
              eq(groupEmailVerifications.registrationGroupId, groupId),
              isNull(groupEmailVerifications.consumedAt),
            ),
          );
        const token = randomBytes(32).toString('base64url');
        await tx.insert(groupEmailVerifications).values({
          organizationId: ctx.organizationId,
          eventId,
          registrationGroupId: groupId,
          tokenHash: digestMessage(token),
          expiresAt: new Date(Date.now() + MESSAGE_VERIFICATION_TOKEN_TTL_MS),
        });
        const verificationUrl = new URL(
          `/registration/verify?token=${encodeURIComponent(token)}`,
          canonicalBaseUrl,
        ).href;
        const outboxId = await enqueueMailOutbox(
          db,
          ctx.organizationId,
          {
            eventId,
            registrationGroupId: groupId,
            templateKey: 'verification',
            templateVersion: 1,
            locale: messageLocale(organization?.locale ?? 'de'),
            recipient: recipient.email,
            idempotencyKey: `${key}:${groupId}`,
            variables: {
              recipientName:
                `${recipient.firstName} ${recipient.lastName}`.trim(),
              verificationUrl,
            },
            correlationId: ctx.correlationId,
          },
          tx,
        );
        await tx.insert(messageCampaignRecipients).values({
          organizationId: ctx.organizationId,
          campaignId: campaign.id,
          eventId,
          entryId: recipient.entryId,
          outboxId,
          email: recipient.email,
          subject: campaign.subject,
          status: 'planned',
        });
      }
      const campaignRecipients = await tx
        .select()
        .from(messageCampaignRecipients)
        .where(eq(messageCampaignRecipients.campaignId, campaign.id));
      return messageCampaignResponse(campaign, campaignRecipients);
    });
  };
}
