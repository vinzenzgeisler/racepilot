import { and, eq } from 'drizzle-orm';
import type {
  MessageCampaignCreate,
  MessageCampaignSendPorts,
  MessageCampaignSendResult,
  MessageCampaignTransaction,
  ObjectStorageProvider,
  RequestContext,
} from '@racepilot/core';
import { sendMessageCampaign } from '@racepilot/core';
import { MESSAGE_ATTACHMENT_LIMITS } from '@racepilot/contracts';
import type { Database, TransactionDatabase } from './database.js';
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

type Campaign = typeof messageCampaigns.$inferSelect;
type CampaignRecipient = typeof messageCampaignRecipients.$inferSelect;
type CampaignResponse = ReturnType<typeof messageCampaignResponse>;

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
  ): Promise<MessageCampaignSendResult<CampaignResponse>> => {
    const ports: MessageCampaignSendPorts<
      Campaign,
      CampaignRecipient,
      CampaignResponse
    > = {
      maxAttachments: MESSAGE_ATTACHMENT_LIMITS.maxCount,
      validateAttachments: async (attachments) => {
        if (attachments.length && !storage)
          return {
            ok: false,
            error: {
              code: 'storage-unavailable',
              message: 'Attachment storage is unavailable',
            },
          };
        let totalBytes = 0;
        for (const attachment of attachments) {
          const object = await storage!.get(
            ctx.organizationId,
            attachment.objectId,
          );
          if (!object || object.ref.contentType !== 'application/pdf')
            return {
              ok: false,
              error: {
                code: 'attachment-unavailable',
                message: 'Attachment is unavailable or not a PDF',
              },
            };
          totalBytes += object.ref.size;
          if (totalBytes > MESSAGE_ATTACHMENT_LIMITS.maxBytes)
            return {
              ok: false,
              error: {
                code: 'attachment-too-large',
                message: 'Attachments exceed the configured size limit',
              },
            };
        }
        return null;
      },
      transaction: (context, work) =>
        db.transaction(async (tx) => {
          const transaction: MessageCampaignTransaction<
            Campaign,
            CampaignRecipient,
            CampaignResponse
          > = {
            resolveRecipients: async (requestedEventId, filter) => {
              const resolved = await resolveMessageRecipients(
                tx,
                context,
                requestedEventId,
                filter,
              );
              return resolved?.recipients ?? null;
            },
            findByIdempotencyKey: async (key) => {
              const [campaign] = await tx
                .select()
                .from(messageCampaigns)
                .where(
                  and(
                    eq(messageCampaigns.organizationId, context.organizationId),
                    eq(messageCampaigns.idempotencyKey, key),
                  ),
                )
                .limit(1);
              if (!campaign) return null;
              const recipients = await tx
                .select()
                .from(messageCampaignRecipients)
                .where(
                  and(
                    eq(
                      messageCampaignRecipients.organizationId,
                      context.organizationId,
                    ),
                    eq(messageCampaignRecipients.campaignId, campaign.id),
                  ),
                );
              return {
                requestHash: campaign.requestHash,
                campaign,
                recipients,
              };
            },
            createCampaign: async (value) => {
              const [campaign] = await tx
                .insert(messageCampaigns)
                .values({
                  organizationId: context.organizationId,
                  eventId: value.eventId,
                  idempotencyKey: value.idempotencyKey,
                  requestHash: digestMessage(value.requestHash),
                  subject: value.subject,
                  textBody: value.text,
                  status: 'planned',
                  actor: value.actor,
                })
                .onConflictDoNothing()
                .returning();
              return campaign ?? null;
            },
            recordAudit: async (campaign, auditActor) => {
              await tx.insert(messageCampaignAudits).values({
                organizationId: context.organizationId,
                campaignId: campaign.id,
                actor: auditActor,
                action: 'send',
              });
            },
            getLocale: async () => {
              const [organization] = await tx
                .select({ locale: organizations.locale })
                .from(organizations)
                .where(eq(organizations.id, context.organizationId))
                .limit(1);
              return organization?.locale ?? 'de';
            },
            enqueueRecipient: async (value) => {
              const outboxId = await enqueueMailOutbox(
                db,
                context.organizationId,
                {
                  eventId: value.eventId,
                  registrationGroupId: value.recipient.registrationGroupId,
                  templateKey: 'message-campaign',
                  templateVersion: 1,
                  locale: messageLocale(value.locale),
                  recipient: value.recipient.email,
                  idempotencyKey: `message-campaign:${value.campaign.id}:${digestMessage(value.recipient.email)}`,
                  variables: {
                    subject: value.subject,
                    body: value.text,
                    attachments: JSON.stringify(value.attachmentRefs),
                  },
                  correlationId: value.correlationId,
                },
                tx,
              );
              const [row] = await tx
                .insert(messageCampaignRecipients)
                .values({
                  organizationId: context.organizationId,
                  campaignId: value.campaign.id,
                  eventId: value.eventId,
                  entryId: value.recipient.entryId,
                  outboxId,
                  email: value.recipient.email,
                  subject: value.subject,
                  status: 'planned',
                })
                .returning();
              return row!;
            },
            markSending: async (campaign) => {
              await tx
                .update(messageCampaigns)
                .set({ status: 'sending' })
                .where(
                  and(
                    eq(messageCampaigns.organizationId, context.organizationId),
                    eq(messageCampaigns.id, campaign.id),
                  ),
                );
            },
            listRecipients: (campaign) =>
              tx
                .select()
                .from(messageCampaignRecipients)
                .where(
                  and(
                    eq(
                      messageCampaignRecipients.organizationId,
                      context.organizationId,
                    ),
                    eq(messageCampaignRecipients.campaignId, campaign.id),
                  ),
                ),
            toResponse: (campaign, recipients) =>
              messageCampaignResponse({ ...campaign, status: 'sending' }, [
                ...recipients,
              ]),
          };
          return work(transaction);
        }),
    };
    return sendMessageCampaign<Campaign, CampaignRecipient, CampaignResponse>(
      ctx,
      eventId,
      idempotencyKey,
      input,
      actor,
      ports,
    );
  };
}
