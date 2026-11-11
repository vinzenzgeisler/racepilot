import { and, eq } from 'drizzle-orm';
import type {
  MessageCampaignCreate,
  MessageCampaignSendPorts,
  MessageCampaignSendResult,
  MessageCampaignTransaction,
  ObjectStorageProvider,
  RequestContext,
} from '@racepilot/core';
import {
  MESSAGE_ATTACHMENT_LIMITS,
  sendMessageCampaign,
} from '@racepilot/core';
import { validateMessageAttachmentMetadata } from './messaging-attachments.js';
import type { Database } from './database.js';
import { organizations } from './schema/organization.js';
import {
  createRegistrationVerificationToken,
  persistRegistrationVerificationToken,
} from './registration-verification-token.js';
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
  canonicalBaseUrl?: string,
) {
  return async (
    ctx: RequestContext,
    eventId: string,
    idempotencyKey: string,
    input: MessageCampaignCreate,
    actor: string,
    mode: { kind: 'campaign' | 'verification'; auditAction?: string } = {
      kind: 'campaign',
    },
  ): Promise<MessageCampaignSendResult<CampaignResponse>> => {
    const ports: MessageCampaignSendPorts<
      Campaign,
      CampaignRecipient,
      CampaignResponse
    > = {
      maxAttachments: MESSAGE_ATTACHMENT_LIMITS.maxCount,
      validateAttachments: (attachments) =>
        validateMessageAttachmentMetadata(
          storage,
          ctx.organizationId,
          attachments,
        ),
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
            recordAudit: async (campaign, auditActor, action) => {
              await tx.insert(messageCampaignAudits).values({
                organizationId: context.organizationId,
                campaignId: campaign.id,
                actor: auditActor,
                action,
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
            enqueueVerificationRecipient: async (value) => {
              if (!canonicalBaseUrl || !value.recipient.registrationGroupId)
                throw new Error('Registration verification is unavailable');
              const now = new Date();
              const token = createRegistrationVerificationToken(now);
              await persistRegistrationVerificationToken(tx, {
                organizationId: context.organizationId,
                eventId: value.eventId,
                registrationGroupId: value.recipient.registrationGroupId,
                tokenHash: token.tokenHash,
                expiresAt: token.expiresAt,
                replaceExisting: true,
              });
              const verificationUrl = new URL(
                `/registration/verify?token=${encodeURIComponent(token.token)}`,
                canonicalBaseUrl,
              ).href;
              const outboxId = await enqueueMailOutbox(
                db,
                context.organizationId,
                {
                  eventId: value.eventId,
                  registrationGroupId: value.recipient.registrationGroupId,
                  templateKey: 'verification',
                  templateVersion: 1,
                  locale: messageLocale(value.locale),
                  recipient: value.recipient.email,
                  idempotencyKey: `message-campaign:${value.campaign.id}:${value.recipient.registrationGroupId}`,
                  variables: {
                    recipientName: value.recipient.fullName,
                    verificationUrl,
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
                  subject: value.campaign.subject,
                  status: 'planned',
                })
                .returning();
              return row!;
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
                  },
                  correlationId: value.correlationId,
                  attachmentRefs: value.attachmentRefs,
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
      mode,
    );
  };
}
