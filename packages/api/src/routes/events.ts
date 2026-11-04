import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import {
  getEvent,
  updateEvent,
  createEvent,
  transitionEvent,
  getPublicEvent,
  createEventClass,
  updateEventClass,
  type EventClassInput,
  setClassPriceRule,
} from '@racepilot/core';
import {
  CreateEventRequest,
  EventResponse,
  CreateEventClassRequest,
  UpdateEventClassRequest,
} from '@racepilot/contracts';

export function registerEventsRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolvePublicContext, resolveMemberContext } = context;
  app.get('/admin/events/:eventId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Invalid event ID' }, 400);
    try {
      const event = await getEvent(context, eventId, { events: deps.events });
      return event ? c.json(event) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden' }, 403);
    }
  });
  app.get('/admin/events', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    return c.json(await deps.events.listByOrganization(context));
  });
  app.post('/admin/events', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    const parsed = CreateEventRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json(
        EventResponse.parse(
          await createEvent(
            context,
            parsed.data as import('@racepilot/core').EventInput,
            { events: deps.events },
          ),
        ),
        201,
      );
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
  app.patch('/admin/events/:eventId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const result = await updateEvent(
        context,
        c.req.param('eventId'),
        await c.req.json(),
        { events: deps.events },
      );
      return result
        ? c.json(EventResponse.parse(result))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
  app.post('/admin/events/:eventId/transitions', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json().catch(() => null);
    const status = z
      .enum(['open', 'closed', 'archived'])
      .safeParse(body?.status);
    if (!status.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await transitionEvent(
        context,
        c.req.param('eventId'),
        status.data,
        new Date(),
        { events: deps.events },
      );
      return result
        ? c.json(EventResponse.parse(result))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid transition' }, 403);
    }
  });
  app.get('/admin/events/:eventId/pricing', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.pricing) return c.json({ error: 'Not found' }, 404);
    return c.json(
      await deps.pricing.listByEvent(context, c.req.param('eventId')),
    );
  });
  app.put('/admin/events/:eventId/pricing/:classId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.pricing) return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({
        baseCents: z.number().int().nonnegative(),
        additionalEntryAdjustmentCents: z.number().int(),
        earlyBirdDeadline: z.string().datetime({ offset: true }).nullable(),
        earlyBirdDiscountCents: z.number().int().nonnegative(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json(
        await setClassPriceRule(
          context,
          c.req.param('eventId'),
          { ...parsed.data, classId: c.req.param('classId') },
          { pricing: deps.pricing },
        ),
      );
    } catch {
      return c.json({ error: 'Forbidden or invalid price rule' }, 403);
    }
  });
  app.get('/public/events/:organizationId/:slug', async (c) => {
    const orgId = c.req.param('organizationId');
    const context = await resolvePublicContext(c.req.raw);
    if (
      !context ||
      !z.string().uuid().safeParse(orgId).success ||
      orgId !== context.organizationId
    )
      return c.json({ error: 'Not found' }, 404);
    const event = await getPublicEvent(
      context,
      c.req.param('slug'),
      new Date(),
      { events: deps.events },
    );
    return event ? c.json(event) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/events/:eventId/classes', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.classes) return c.json({ error: 'Not found' }, 404);
    const parsed = CreateEventClassRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json(
        await createEventClass(context, c.req.param('eventId'), parsed.data, {
          events: deps.events,
          classes: deps.classes,
        }),
        201,
      );
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
  app.get('/admin/events/:eventId/classes', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.classes) return c.json({ error: 'Not found' }, 404);
    return c.json(
      await deps.classes.listByEvent(context, c.req.param('eventId')),
    );
  });
  app.patch('/admin/events/:eventId/classes/:classId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.classes) return c.json({ error: 'Not found' }, 404);
    const parsed = UpdateEventClassRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await updateEventClass(
        context,
        c.req.param('eventId'),
        c.req.param('classId'),
        parsed.data as Partial<EventClassInput>,
        { events: deps.events, classes: deps.classes },
      );
      return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
}
