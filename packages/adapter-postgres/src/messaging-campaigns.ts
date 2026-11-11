import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { RequestContext } from '@racepilot/core';
import { transitionMessageCampaign } from '@racepilot/core';
import type { Database } from './database.js';
import { events } from './schema/organization.js';
import { emailOutbox } from './mail-schema.js';
import {
  messageCampaignAudits,
  messageCampaignRecipients,
  messageCampaigns,
} from './messaging-schema.js';
import { messageCampaignResponse } from './messaging-utils.js';

export function createMessageCampaignRepository(db: Database) {
  return {
    list: async (ctx: RequestContext, eventId: string) => {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .limit(1);
      if (!event) return null;
      const campaigns = await db
        .select()
        .from(messageCampaigns)
        .where(
          and(
            eq(messageCampaigns.organizationId, ctx.organizationId),
            eq(messageCampaigns.eventId, eventId),
          ),
        )
        .orderBy(desc(messageCampaigns.createdAt));
      const result = [];
      for (const campaign of campaigns) {
        const recipients = await db
          .select()
          .from(messageCampaignRecipients)
          .where(
            and(
              eq(messageCampaignRecipients.organizationId, ctx.organizationId),
              eq(messageCampaignRecipients.campaignId, campaign.id),
            ),
          );
        result.push(messageCampaignResponse(campaign, recipients));
      }
      return result;
    },
    retryFailed: async (ctx: RequestContext, campaignId: string) =>
      db.transaction(async (tx) => {
        const [campaign] = await tx
          .select()
          .from(messageCampaigns)
          .where(
            and(
              eq(messageCampaigns.organizationId, ctx.organizationId),
              eq(messageCampaigns.id, campaignId),
            ),
          )
          .limit(1);
        if (!campaign || campaign.status !== 'failed') return null;
        const failedToPlanned = transitionMessageCampaign('failed', 'planned');
        const retryStatus = transitionMessageCampaign('planned', 'sending');
        if (!failedToPlanned.ok || !retryStatus.ok) return null;
        const failed = await tx
          .select({ outboxId: messageCampaignRecipients.outboxId })
          .from(messageCampaignRecipients)
          .where(
            and(
              eq(messageCampaignRecipients.organizationId, ctx.organizationId),
              eq(messageCampaignRecipients.campaignId, campaignId),
              eq(messageCampaignRecipients.status, 'failed'),
            ),
          );
        const outboxIds = failed.flatMap((item) =>
          item.outboxId ? [item.outboxId] : [],
        );
        if (!outboxIds.length) return null;
        await tx
          .update(emailOutbox)
          .set({
            status: 'pending',
            attempts: 0,
            availableAt: new Date(),
            claimedAt: null,
            lastError: null,
          })
          .where(
            and(
              eq(emailOutbox.organizationId, ctx.organizationId),
              inArray(emailOutbox.id, outboxIds),
              eq(emailOutbox.status, 'failed'),
            ),
          );
        for (const outboxId of outboxIds) {
          const envelope = {
            type: 'mail.outbox',
            schemaVersion: 1,
            organizationId: ctx.organizationId,
            correlationId: campaignId,
            payload: { outboxId },
          };
          await tx.execute(
            sql`select graphile_worker.add_job(identifier := 'mail_outbox', payload := ${JSON.stringify(envelope)}::json, run_at := now(), job_key := ${`mail-outbox:${outboxId}`}, job_key_mode := 'replace')`,
          );
        }
        await tx
          .update(messageCampaignRecipients)
          .set({ status: 'planned' })
          .where(
            and(
              eq(messageCampaignRecipients.organizationId, ctx.organizationId),
              eq(messageCampaignRecipients.campaignId, campaignId),
              eq(messageCampaignRecipients.status, 'failed'),
            ),
          );
        await tx
          .update(messageCampaigns)
          .set({ status: retryStatus.value })
          .where(
            and(
              eq(messageCampaigns.organizationId, ctx.organizationId),
              eq(messageCampaigns.id, campaignId),
              eq(messageCampaigns.status, 'failed'),
            ),
          );
        await tx.insert(messageCampaignAudits).values({
          organizationId: ctx.organizationId,
          campaignId,
          actor: ctx.subject
            ? `${ctx.subject.issuer}|${ctx.subject.subject}`
            : ctx.correlationId,
          action: 'retry-failed',
        });
        const [updated] = await tx
          .select()
          .from(messageCampaigns)
          .where(eq(messageCampaigns.id, campaignId))
          .limit(1);
        const recipients = await tx
          .select()
          .from(messageCampaignRecipients)
          .where(eq(messageCampaignRecipients.campaignId, campaignId));
        return updated ? messageCampaignResponse(updated, recipients) : null;
      }),
  };
}
