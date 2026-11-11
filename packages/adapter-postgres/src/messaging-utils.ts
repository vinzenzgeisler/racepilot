import { createHash } from 'node:crypto';
import {
  messageCampaignRecipients,
  messageCampaigns,
} from './messaging-schema.js';

export const digestMessage = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
export const messageLocale = (locale: string): 'de' | 'en' =>
  locale === 'en' ? 'en' : 'de';

export function messageCampaignResponse(
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
