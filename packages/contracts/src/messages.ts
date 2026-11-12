import { z } from 'zod';

export const MESSAGE_ATTACHMENT_LIMITS = Object.freeze({
  maxCount: 5,
  maxBytes: 10 * 1024 * 1024,
});
export const MESSAGE_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export const MessageRecipientFilterSchema = z
  .object({
    classIds: z.array(z.string().uuid()).max(100).default([]),
    statuses: z
      .array(z.enum(['pending', 'accepted', 'rejected', 'withdrawn']))
      .max(50)
      .default([]),
    emailVerified: z.boolean().optional(),
    payment: z.enum(['any', 'paid', 'open', 'unpaid']).default('any'),
    entryIds: z.array(z.string().uuid()).max(500).default([]),
    additionalAddresses: z
      .array(z.string().trim().email().max(320))
      .max(100)
      .default([]),
  })
  .strict();
export const MessageTemplateSchema = z
  .object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(120),
    subject: z.string().min(1).max(998),
    text: z.string().min(1).max(50000),
  })
  .strict();
export const MessageCampaignCreateSchema = z
  .object({
    eventId: z.string().uuid(),
    recipients: MessageRecipientFilterSchema,
    subject: z.string().min(1).max(998),
    text: z.string().min(1).max(50000),
    attachments: z
      .array(
        z
          .object({
            objectId: z.string().uuid(),
            filename: z
              .string()
              .trim()
              .min(1)
              .max(120)
              .regex(/^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.pdf$/i),
          })
          .strict(),
      )
      .max(MESSAGE_ATTACHMENT_LIMITS.maxCount)
      .default([]),
  })
  .strict();
export const MessageCampaignStatusSchema = z.enum([
  'planned',
  'sending',
  'sent',
  'failed',
]);
export type MessageRecipientFilter = z.infer<
  typeof MessageRecipientFilterSchema
>;
export type MessageTemplate = z.infer<typeof MessageTemplateSchema>;
export type MessageCampaignCreate = z.infer<typeof MessageCampaignCreateSchema>;

export const MessageRecipientPreviewSchema = z.object({
  count: z.number().int(),
  recipients: z.array(
    z
      .object({
        entryId: z.string().uuid().nullable(),
        email: z.string().email(),
        name: z.string(),
      })
      .passthrough(),
  ),
});
export const MessageTemplateRecordSchema = z
  .object({
    id: z.string().uuid(),
    eventId: z.string().uuid().nullable(),
    name: z.string(),
    subject: z.string(),
    textBody: z.string(),
  })
  .passthrough();
export const MessageRenderedPreviewSchema = z.object({
  recipient: z.object({ email: z.string(), name: z.string() }),
  subject: z.string(),
  text: z.string(),
});
export const MessageCampaignRecordSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  subject: z.string(),
  status: MessageCampaignStatusSchema,
  createdAt: z.string(),
  total: z.number(),
  sent: z.number(),
  failed: z.number(),
  recipients: z.array(
    z.object({
      id: z.string().uuid(),
      entryId: z.string().nullable(),
      email: z.string(),
      subject: z.string(),
      status: MessageCampaignStatusSchema,
    }),
  ),
});
export const MessageAttachmentRecordSchema = z.object({
  objectId: z.string().uuid(),
  filename: z.string(),
  size: z.number(),
  contentType: z.literal('application/pdf'),
});
export const MessageErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.array(z.string()).optional(),
});
export type MessageRecipientPreview = z.infer<
  typeof MessageRecipientPreviewSchema
>;
export type MessageTemplateRecord = z.infer<typeof MessageTemplateRecordSchema>;
export type MessageRenderedPreview = z.infer<
  typeof MessageRenderedPreviewSchema
>;
export type MessageCampaignRecord = z.infer<typeof MessageCampaignRecordSchema>;
export type MessageAttachmentRecord = z.infer<
  typeof MessageAttachmentRecordSchema
>;
