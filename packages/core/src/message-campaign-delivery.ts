import { renderMessageTemplate } from './messages.js';
import type { MessageCampaignDeliveryStrategy } from './message-campaign-send.js';

export function messageCampaignDelivery<
  Campaign,
  CampaignRecipient,
>(): MessageCampaignDeliveryStrategy<Campaign, CampaignRecipient> {
  return {
    auditAction: 'send',
    validateRecipients: () => ({ ok: true }),
    enqueue: async (transaction, value) => {
      const rendered = renderMessageTemplate(
        value.input.subject,
        value.input.text,
        value.recipient,
      );
      if (!rendered.ok)
        return {
          ok: false,
          error: {
            code: 'invalid-template',
            message: 'Message template is invalid',
            details: rendered.errors,
          },
        };
      const recipient = await transaction.enqueueRecipient({
        campaign: value.campaign,
        eventId: value.eventId,
        recipient: value.recipient,
        subject: rendered.value.subject,
        text: rendered.value.text,
        locale: value.locale,
        attachmentRefs: value.input.attachments.map(
          ({ objectId, filename }) => ({ objectId, filename }),
        ),
        correlationId: value.correlationId,
      });
      return { ok: true, recipient };
    },
  };
}
