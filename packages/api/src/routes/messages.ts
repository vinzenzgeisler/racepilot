import type { ApiRoutesContext } from './context.js';
import {
  MESSAGE_ATTACHMENT_LIMITS,
  MessageCampaignCreateSchema,
  MessageRecipientFilterSchema,
  MessageTemplateSchema,
} from '@racepilot/contracts';
import { z } from 'zod';
import type { ObjectStorageProvider } from '@racepilot/core';

function messageCampaignResponse(
  data: import('@racepilot/core').MessageCampaignData,
) {
  const { campaign, recipients } = data;
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

export function registerMessageRoutes(context: ApiRoutesContext): void {
  const { app, deps, requireMember } = context;
  const messages = deps.messages;
  app.post('/admin/events/:eventId/messages/recipients/preview', async (c) => {
    const access = await requireMember(c.req.raw, 'entry:read');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const body = MessageRecipientFilterSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!eventId.success || !body.success)
      return c.json({ error: 'Invalid request' }, 400);
    const result = await messages.preview(member, eventId.data, body.data);
    return result.ok
      ? c.json(result.value)
      : c.json({ error: result.error.message, code: result.error.code }, 404);
  });
  app.get('/admin/events/:eventId/messages/templates', async (c) => {
    const access = await requireMember(c.req.raw, 'entry:read');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    if (!eventId.success) return c.json({ error: 'Not found' }, 404);
    const templates = await messages.listTemplates(member, eventId.data);
    return templates
      ? c.json({ items: templates })
      : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/events/:eventId/messages/templates', async (c) => {
    const access = await requireMember(c.req.raw, 'event:write');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const input = MessageTemplateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (
      !eventId.success ||
      !input.success ||
      (input.data.eventId !== null && input.data.eventId !== eventId.data)
    )
      return c.json({ error: 'Invalid request' }, 400);
    const saved = await messages.saveTemplate(member, input.data);
    return saved
      ? c.json(saved, input.data.id ? 200 : 201)
      : c.json({ error: 'Invalid template or event' }, 400);
  });
  app.post('/admin/events/:eventId/messages/templates/preview', async (c) => {
    const access = await requireMember(c.req.raw, 'entry:read');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const body = z
      .object({
        recipients: MessageRecipientFilterSchema,
        subject: z.string().min(1).max(998),
        text: z.string().min(1).max(50000),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!eventId.success || !body.success)
      return c.json({ error: 'Invalid request' }, 400);
    const preview = await messages.previewTemplate(
      member,
      eventId.data,
      body.data.recipients,
      body.data.subject,
      body.data.text,
    );
    if (preview.ok) return c.json(preview.value);
    const status = preview.error.code === 'event-not-found' ? 404 : 422;
    return c.json(
      {
        error: preview.error.message,
        code: preview.error.code,
        ...(preview.error.details ? { details: preview.error.details } : {}),
      },
      status,
    );
  });

  app.post('/admin/events/:eventId/messages/actions/:action', async (c) => {
    const access = await requireMember(c.req.raw, 'event:write');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const action = z
      .enum(['resend-verification', 'remind-open-payments'])
      .safeParse(c.req.param('action'));
    if (!eventId.success || !action.success)
      return c.json({ error: 'Invalid request' }, 400);
    const actor = member.subject
      ? `${member.subject.issuer}|${member.subject.subject}`
      : member.correlationId;
    const campaign = await messages.quickAction(
      member,
      eventId.data,
      action.data,
      actor,
    );
    if (campaign.ok)
      return c.json(messageCampaignResponse(campaign.campaign), 202);
    const status =
      campaign.error.code === 'verification-unavailable'
        ? 503
        : campaign.error.code === 'event-not-found'
          ? 404
          : 422;
    return c.json(
      { error: campaign.error.message, code: campaign.error.code },
      status,
    );
  });

  app.post('/admin/events/:eventId/messages/campaigns', async (c) => {
    const access = await requireMember(c.req.raw, 'event:write');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const key = z
      .string()
      .trim()
      .min(8)
      .max(200)
      .safeParse(c.req.header('Idempotency-Key'));
    const body = MessageCampaignCreateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (
      !eventId.success ||
      !key.success ||
      !body.success ||
      body.data.eventId !== eventId.data
    )
      return c.json({ error: 'Invalid request' }, 400);
    const actor = member.subject
      ? `${member.subject.issuer}|${member.subject.subject}`
      : member.correlationId;
    const campaign = await messages.send(
      member,
      eventId.data,
      key.data,
      body.data,
      actor,
    );
    if (campaign.ok)
      return c.json(messageCampaignResponse(campaign.campaign), 202);
    const status =
      campaign.error.code === 'idempotency-conflict'
        ? 409
        : campaign.error.code === 'event-not-found'
          ? 404
          : 422;
    return c.json(
      {
        error: campaign.error.message,
        code: campaign.error.code,
        ...(campaign.error.details ? { details: campaign.error.details } : {}),
      },
      status,
    );
  });
  app.post('/admin/message-campaigns/:campaignId/retry', async (c) => {
    const access = await requireMember(c.req.raw, 'event:write');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const id = z.string().uuid().safeParse(c.req.param('campaignId'));
    if (!id.success) return c.json({ error: 'Not found' }, 404);
    const campaign = await messages.retryFailed(member, id.data);
    return campaign
      ? c.json(campaign, 202)
      : c.json({ error: 'Not found' }, 404);
  });
  app.get('/admin/events/:eventId/messages/campaigns', async (c) => {
    const access = await requireMember(c.req.raw, 'entry:read');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    if (!eventId.success) return c.json({ error: 'Not found' }, 404);
    const campaigns = await messages.list(member, eventId.data);
    return campaigns
      ? c.json({ items: campaigns })
      : c.json({ error: 'Not found' }, 404);
  });
}

/** PDF attachments for message campaigns; registered only with object storage. */
export function registerMessageAttachmentRoutes(
  { app, deps, requireMember }: ApiRoutesContext,
  storage: ObjectStorageProvider,
): void {
  app.post('/admin/events/:eventId/messages/attachments', async (c) => {
    const access = await requireMember(c.req.raw, 'event:write');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const member = access.context;
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const body = z
      .object({
        filename: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.pdf$/i),
        contentType: z.literal('application/pdf'),
        contentBase64: z
          .string()
          .max(Math.ceil((MESSAGE_ATTACHMENT_LIMITS.maxBytes * 4) / 3) + 8),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (
      !eventId.success ||
      !body.success ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data.contentBase64)
    )
      return c.json({ error: 'Invalid PDF attachment' }, 400);
    const event = await deps.events.getById(member, eventId.data);
    if (!event) return c.json({ error: 'Not found' }, 404);
    const content = Buffer.from(body.data.contentBase64, 'base64');
    if (
      !content.length ||
      content.length > MESSAGE_ATTACHMENT_LIMITS.maxBytes ||
      new TextDecoder().decode(content.slice(0, 5)) !== '%PDF-'
    )
      return c.json({ error: 'Invalid PDF attachment' }, 400);
    const stored = await storage.put({
      organizationId: member.organizationId,
      body: new Uint8Array(content),
      contentType: 'application/pdf',
    });
    return c.json(
      {
        objectId: stored.objectId,
        filename: body.data.filename,
        size: stored.size,
        contentType: stored.contentType,
      },
      201,
    );
  });
}
