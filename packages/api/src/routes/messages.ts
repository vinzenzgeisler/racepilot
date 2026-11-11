import type { ApiRoutesContext } from './context.js';
import { MessageCampaignCreateSchema, MessageRecipientFilterSchema } from '@racepilot/contracts';
import { z } from 'zod';

export function registerMessageRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolveMemberContext } = context;
  app.post('/admin/events/:eventId/messages/recipients/preview', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('entry:read')) return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const body = MessageRecipientFilterSchema.safeParse(await c.req.json().catch(() => null));
    if (!eventId.success || !body.success) return c.json({ error: 'Invalid request' }, 400);
    const result = await deps.messages.preview(member, eventId.data, body.data);
    return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/events/:eventId/messages/campaigns', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('event:write')) return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const key = z.string().trim().min(8).max(200).safeParse(c.req.header('Idempotency-Key'));
    const body = MessageCampaignCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!eventId.success || !key.success || !body.success || body.data.eventId !== eventId.data)
      return c.json({ error: 'Invalid request' }, 400);
    const actor = member.subject ? `${member.subject.issuer}|${member.subject.subject}` : member.correlationId;
    const campaign = await deps.messages.send(member, eventId.data, key.data, body.data, actor);
    return campaign ? c.json(campaign, 202) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/message-campaigns/:campaignId/retry', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('event:write')) return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const id = z.string().uuid().safeParse(c.req.param('campaignId'));
    if (!id.success) return c.json({ error: 'Not found' }, 404);
    const campaign = await deps.messages.retryFailed(member, id.data);
    return campaign ? c.json(campaign, 202) : c.json({ error: 'Not found' }, 404);
  });
  app.get('/admin/events/:eventId/messages/campaigns', async (c) => {
    const member = await resolveMemberContext(c.req.raw);
    if (!member) return c.json({ error: 'Unauthorized' }, 401);
    if (!member.permissions.has('entry:read')) return c.json({ error: 'Forbidden' }, 403);
    if (!deps.messages) return c.json({ error: 'Not found' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    if (!eventId.success) return c.json({ error: 'Not found' }, 404);
    const campaigns = await deps.messages.list(member, eventId.data);
    return campaigns ? c.json({ items: campaigns }) : c.json({ error: 'Not found' }, 404);
  });
}
