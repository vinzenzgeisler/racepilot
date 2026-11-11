import { and, eq } from 'drizzle-orm';
import type {
  MessageCampaignCreate,
  ObjectStorageProvider,
  RequestContext,
} from '@racepilot/core';
import {
  fingerprintMessageRequest,
  renderMessageTemplate,
  transitionMessageCampaign,
  validateMessageTemplate,
} from '@racepilot/core';
import { MESSAGE_ATTACHMENT_LIMITS } from '@racepilot/contracts';
import type { Database } from './database.js';
import { organizations } from './schema/organization.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import {
  messageCampaignAudits,
  messageCampaignRecipients,
  messageCampaigns,
} from './messaging-schema.js';
import { resolveMessageRecipients } from './messaging-recipients.js';
import {
  digestMessage,
  messageCampaignResponse,
  messageLocale,
} from './messaging-utils.js';

export function createMessageSender(
  db: Database,
  storage?: ObjectStorageProvider,
) {
  return async (
    ctx: RequestContext,
    eventId: string,
    idempotencyKey: string,
    input: MessageCampaignCreate,
    actor: string,
  ) => {
    if (
      validateMessageTemplate(input.subject, input.text).length ||
      input.attachments.length > MESSAGE_ATTACHMENT_LIMITS.maxCount
    )
      return null;
    const attachmentRefs: Array<{ objectId: string; filename: string }> = [];
    let attachmentBytes = 0;
    for (const attachment of input.attachments) {
      const object = await storage?.get(
        ctx.organizationId,
        attachment.objectId,
      );
      if (!object || object.ref.contentType !== 'application/pdf') return null;
      attachmentBytes += object.ref.size;
      if (attachmentBytes > MESSAGE_ATTACHMENT_LIMITS.maxBytes) return null;
      attachmentRefs.push({
        objectId: attachment.objectId,
        filename: attachment.filename,
      });
    }
    const resolved = await resolveMessageRecipients(
      db,
      ctx,
      eventId,
      input.recipients,
    );
    if (!resolved || !resolved.count) return null;
    const requestHash = digestMessage(fingerprintMessageRequest(input));
    const sendingStatus = transitionMessageCampaign('planned', 'sending');
    return db.transaction(async (tx) => {
      const [campaign] = await tx
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
      if (!campaign) {
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
        const recipients = await tx
          .select()
          .from(messageCampaignRecipients)
          .where(
            and(
              eq(messageCampaignRecipients.organizationId, ctx.organizationId),
              eq(messageCampaignRecipients.campaignId, existing.id),
            ),
          );
        return messageCampaignResponse(existing, recipients);
      }
      await tx.insert(messageCampaignAudits).values({
        organizationId: ctx.organizationId,
        campaignId: campaign.id,
        actor,
        action: 'send',
      });
      const [organization] = await tx
        .select({ locale: organizations.locale })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId))
        .limit(1);
      for (const recipient of resolved.recipients) {
        const rendered = renderMessageTemplate(input.subject, input.text, {
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          fullName: recipient.fullName,
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
            locale: messageLocale(organization?.locale ?? 'de'),
            recipient: recipient.email,
            idempotencyKey: `message-campaign:${campaign.id}:${digestMessage(recipient.email)}`,
            variables: {
              subject: rendered.subject,
              body: rendered.text,
              attachments: JSON.stringify(attachmentRefs),
            },
            correlationId: ctx.correlationId,
          },
          tx,
        );
        await tx.insert(messageCampaignRecipients).values({
          organizationId: ctx.organizationId,
          campaignId: campaign.id,
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
        .set({ status: sendingStatus })
        .where(
          and(
            eq(messageCampaigns.organizationId, ctx.organizationId),
            eq(messageCampaigns.id, campaign.id),
          ),
        );
      const recipients = await tx
        .select()
        .from(messageCampaignRecipients)
        .where(eq(messageCampaignRecipients.campaignId, campaign.id));
      return messageCampaignResponse(
        { ...campaign, status: sendingStatus },
        recipients,
      );
    });
  };
}
