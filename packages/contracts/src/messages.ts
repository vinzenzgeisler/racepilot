import { z } from 'zod';

export const MessageRecipientFilterSchema = z.object({
  classIds: z.array(z.string().uuid()).max(100).default([]),
  statuses: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  emailVerified: z.boolean().optional(),
  payment: z.enum(['any', 'paid', 'open', 'unpaid']).default('any'),
  entryIds: z.array(z.string().uuid()).max(500).default([]),
  additionalAddresses: z.array(z.string().trim().email().max(320)).max(100).default([]),
}).strict();
export const MessageTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  eventId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  subject: z.string().min(1).max(998),
  text: z.string().min(1).max(50000),
}).strict();
export const MessageCampaignCreateSchema = z.object({
  eventId: z.string().uuid(),
  recipients: MessageRecipientFilterSchema,
  subject: z.string().min(1).max(998),
  text: z.string().min(1).max(50000),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
}).strict();
export const MessageCampaignStatusSchema = z.enum(['planned', 'sending', 'sent', 'failed']);
export type MessageRecipientFilter = z.infer<typeof MessageRecipientFilterSchema>;
export type MessageTemplate = z.infer<typeof MessageTemplateSchema>;
export type MessageCampaignCreate = z.infer<typeof MessageCampaignCreateSchema>;
