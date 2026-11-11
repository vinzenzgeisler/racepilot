import type { ApiRoutesContext } from './context.js';
import {
  MESSAGE_ATTACHMENT_LIMITS,
  MessageCampaignCreateSchema,
  MessageRecipientFilterSchema,
  MessageTemplateSchema,
} from '@racepilot/contracts';
import { z } from 'zod';

export function registerMessageRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolveMemberContext } = context;
  app.post('/admin/events/:eventId/messages/recipients/preview', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const body = MessageRecipientFilterSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!eventId.success || !body.success)
      return c.json({ error: 'Invalid request' }, 400);
    const result = await deps.messages.preview(member, eventId.data, body.data);
    return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/events/:eventId/messages/attachments', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.objectStorage)
      return c.json({ error: 'Storage unavailable' }, 503);
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
    const stored = await deps.objectStorage.put({
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

  app.get('/admin/events/:eventId/messages/templates', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    if (!eventId.success) return c.json({ error: 'Not found' }, 404);
    const templates = await deps.messages.listTemplates(member, eventId.data);
    return templates
      ? c.json({ items: templates })
      : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/events/:eventId/messages/templates', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
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
    const saved = await deps.messages.saveTemplate(member, input.data);
    return saved
      ? c.json(saved, input.data.id ? 200 : 201)
      : c.json({ error: 'Invalid template or event' }, 400);
  });
  app.post('/admin/events/:eventId/messages/templates/preview', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
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
    const preview = await deps.messages.previewTemplate(
      member,
      eventId.data,
      body.data.recipients,
      body.data.subject,
      body.data.text,
    );
    return preview
      ? c.json(preview)
      : c.json({ error: 'No example recipient or invalid placeholder' }, 400);
  });

  app.post('/admin/events/:eventId/messages/actions/:action', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const action = z
      .enum(['resend-verification', 'remind-open-payments'])
      .safeParse(c.req.param('action'));
    if (!eventId.success || !action.success)
      return c.json({ error: 'Invalid request' }, 400);
    const actor = member.subject
      ? `${member.subject.issuer}|${member.subject.subject}`
      : member.correlationId;
    const campaign = await deps.messages.quickAction(
      member,
      eventId.data,
      action.data,
      actor,
    );
    return campaign
      ? c.json(campaign, 202)
      : c.json({ error: 'No matching recipients or unavailable action' }, 404);
  });

  app.post('/admin/events/:eventId/messages/campaigns', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
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
    const campaign = await deps.messages.send(
      member,
      eventId.data,
      key.data,
      body.data,
      actor,
    );
    return campaign
      ? c.json(campaign, 202)
      : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/message-campaigns/:campaignId/retry', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const id = z.string().uuid().safeParse(c.req.param('campaignId'));
    if (!id.success) return c.json({ error: 'Not found' }, 404);
    const campaign = await deps.messages.retryFailed(member, id.data);
    return campaign
      ? c.json(campaign, 202)
      : c.json({ error: 'Not found' }, 404);
  });
  app.get('/admin/events/:eventId/messages/campaigns', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    if (!eventId.success) return c.json({ error: 'Not found' }, 404);
    const campaigns = await deps.messages.list(member, eventId.data);
    return campaigns
      ? c.json({ items: campaigns })
      : c.json({ error: 'Not found' }, 404);
  });
}
