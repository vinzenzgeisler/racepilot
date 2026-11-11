import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type {
  MessageCampaignCreate,
  MessageRecipientFilter,
  MessageTemplate,
} from '@racepilot/contracts';
import type { RequestContext } from '@racepilot/core';
import {
  fingerprintMessageRequest,
  renderMessageTemplate,
  validateMessageTemplate,
} from '@racepilot/core';
import type { Database } from './database.js';
import { events, organizations } from './schema/organization.js';
import { emailOutbox } from './mail-schema.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import {
  messageCampaignAudits,
  messageCampaignRecipients,
  messageCampaigns,
  messageTemplates,
} from './messaging-schema.js';
import { resolveMessageRecipients } from './messaging-recipients.js';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const localeFor = (locale: string): 'de' | 'en' =>
  locale === 'en' ? 'en' : 'de';

export function createMessageRepository(db: Database) {
  return {
    preview: (
      ctx: RequestContext,
      eventId: string,
      filter: MessageRecipientFilter,
    ) => resolveMessageRecipients(db, ctx, eventId, filter),

    listTemplates: async (ctx: RequestContext, eventId: string) => {
      const event = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .limit(1);
      if (!event.length) return null;
      const rows = await db
        .select()
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.organizationId, ctx.organizationId),
            or(
              isNull(messageTemplates.eventId),
              eq(messageTemplates.eventId, eventId),
            ),
          ),
        )
        .orderBy(messageTemplates.name);
      return rows;
    },

    saveTemplate: async (ctx: RequestContext, input: MessageTemplate) => {
      if (validateMessageTemplate(input.subject, input.text).length)
        return null;
      if (input.eventId) {
        const event = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, input.eventId),
            ),
          )
          .limit(1);
        if (!event.length) return null;
      }
      const values = {
        organizationId: ctx.organizationId,
        eventId: input.eventId,
        name: input.name,
        subject: input.subject,
        textBody: input.text,
        updatedAt: new Date(),
      };
      if (!input.id) {
        const [created] = await db
          .insert(messageTemplates)
          .values(values)
          .returning();
        return created ?? null;
      }
      const [updated] = await db
        .update(messageTemplates)
        .set(values)
        .where(
          and(
            eq(messageTemplates.organizationId, ctx.organizationId),
            eq(messageTemplates.id, input.id),
          ),
        )
        .returning();
      return updated ?? null;
    },

    previewTemplate: async (
      ctx: RequestContext,
      eventId: string,
      filter: MessageRecipientFilter,
      subject: string,
      text: string,
    ) => {
      const result = await resolveMessageRecipients(db, ctx, eventId, filter);
      if (
        !result ||
        !result.recipients.length ||
        validateMessageTemplate(subject, text).length
      )
        return null;
      const recipient = result.recipients[0]!;
      return {
        recipient: { email: recipient.email, name: recipient.name },
        ...renderMessageTemplate(subject, text, {
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          fullName: recipient.fullName,
          email: recipient.email,
          eventName: recipient.eventName,
          className: recipient.className,
          entryNumber: recipient.entryNumber,
        }),
      };
    },

    send: async (
      ctx: RequestContext,
      eventId: string,
      idempotencyKey: string,
      input: MessageCampaignCreate,
      actor: string,
    ) => {
      if (validateMessageTemplate(input.subject, input.text).length)
        return null;
      const resolved = await resolveMessageRecipients(
        db,
        ctx,
        eventId,
        input.recipients,
      );
      if (!resolved) return null;
      const requestHash = digest(fingerprintMessageRequest(input));
      return db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(messageCampaigns)
          .values({
            organizationId: ctx.organizationId,
            eventId,
            idempotencyKey,
            requestHash,
            subject: input.subject,
            textBody: input.text,
            status: 'planned',
            actor,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted) {
          const [existing] = await tx
            .select()
            .from(messageCampaigns)
            .where(
              and(
                eq(messageCampaigns.organizationId, ctx.organizationId),
                eq(messageCampaigns.idempotencyKey, idempotencyKey),
              ),
            )
            .limit(1);
          if (!existing || existing.requestHash !== requestHash) return null;
          return campaignResponse(
            existing,
            await tx
              .select()
              .from(messageCampaignRecipients)
              .where(
                and(
                  eq(
                    messageCampaignRecipients.organizationId,
                    ctx.organizationId,
                  ),
                  eq(messageCampaignRecipients.campaignId, existing.id),
                ),
              ),
          );
        }
        await tx.insert(messageCampaignAudits).values({
          organizationId: ctx.organizationId,
          campaignId: inserted.id,
          actor,
          action: 'send',
        });
        const [org] = await tx
          .select({ locale: organizations.locale })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .limit(1);
        for (const recipient of resolved.recipients) {
          const rendered = renderMessageTemplate(input.subject, input.text, {
            firstName: recipient.firstName,
            lastName: recipient.lastName,
            fullName: `${recipient.firstName} ${recipient.lastName}`.trim(),
            email: recipient.email,
            eventName: recipient.eventName,
            className: recipient.className,
            entryNumber: recipient.entryNumber,
          });
          const outboxId = await enqueueMailOutbox(
            db,
            ctx.organizationId,
            {
              eventId,
              registrationGroupId: recipient.registrationGroupId ?? null,
              templateKey: 'message-campaign',
              templateVersion: 1,
              locale: localeFor(org?.locale ?? 'de'),
              recipient: recipient.email,
              idempotencyKey: `message-campaign:${inserted.id}:${digest(recipient.email)}`,
              variables: { subject: rendered.subject, body: rendered.text },
              correlationId: ctx.correlationId,
            },
            tx,
          );
          await tx.insert(messageCampaignRecipients).values({
            organizationId: ctx.organizationId,
            campaignId: inserted.id,
            eventId,
            entryId: recipient.entryId || null,
            outboxId,
            email: recipient.email,
            subject: rendered.subject,
            status: 'planned',
          });
        }
        await tx
          .update(messageCampaigns)
          .set({ status: resolved.count ? 'sending' : 'sent' })
          .where(
            and(
              eq(messageCampaigns.organizationId, ctx.organizationId),
              eq(messageCampaigns.id, inserted.id),
            ),
          );
        const [campaign] = await tx
          .select()
          .from(messageCampaigns)
          .where(eq(messageCampaigns.id, inserted.id))
          .limit(1);
        const rows = await tx
          .select()
          .from(messageCampaignRecipients)
          .where(eq(messageCampaignRecipients.campaignId, inserted.id));
        return campaign ? campaignResponse(campaign, rows) : null;
      });
    },

    list: async (ctx: RequestContext, eventId: string) => {
      const event = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .limit(1);
      if (!event.length) return null;
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
        result.push(campaignResponse(campaign, recipients));
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
        if (!campaign) return null;
        const rows = await tx
          .select({ outboxId: messageCampaignRecipients.outboxId })
          .from(messageCampaignRecipients)
          .where(
            and(
              eq(messageCampaignRecipients.organizationId, ctx.organizationId),
              eq(messageCampaignRecipients.campaignId, campaignId),
              eq(messageCampaignRecipients.status, 'failed'),
            ),
          );
        if (!rows.length) return null;
        const outboxIds = rows.flatMap((row) =>
          row.outboxId ? [row.outboxId] : [],
        );
        if (outboxIds.length) {
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
          for (const outboxId of outboxIds)
            await tx.execute(
              sql`select graphile_worker.add_job(identifier := 'mail_outbox', payload := ${JSON.stringify({ type: 'mail.outbox', schemaVersion: 1, organizationId: ctx.organizationId, correlationId: campaignId, payload: { outboxId } })}::json, run_at := now(), job_key := ${`mail-outbox:${outboxId}`}, job_key_mode := 'replace')`,
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
          .set({ status: 'sending' })
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
        return updated ? campaignResponse(updated, recipients) : null;
      }),
  };
}

function campaignResponse(
  campaign: typeof messageCampaigns.$inferSelect,
  recipients: Array<typeof messageCampaignRecipients.$inferSelect>,
) {
  return {
    id: campaign.id,
    eventId: campaign.eventId,
    subject: campaign.subject,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    total: recipients.length,
    sent: recipients.filter((recipient) => recipient.status === 'sent').length,
    failed: recipients.filter((recipient) => recipient.status === 'failed')
      .length,
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      entryId: recipient.entryId,
      email: recipient.email,
      subject: recipient.subject,
      status: recipient.status,
    })),
  };
}
