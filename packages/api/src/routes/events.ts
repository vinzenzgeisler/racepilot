import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import { registerEventSetupRoute } from './event-setup.js';
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
  openEvent,
  mergeClassPriceRule,
} from '@racepilot/core';
import {
  CreateEventRequest,
  EventResponse,
  CreateEventClassRequest,
  UpdateEventClassRequest,
} from '@racepilot/contracts';

export function registerEventsRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolvePublicContext, requireMember } = context;
  registerEventSetupRoute(context);
  app.get('/admin/events/:eventId', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
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
    const guard = await requireMember(c.req.raw, 'event:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    return c.json(await deps.events.listByOrganization(context));
  });
  app.post('/admin/events', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
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
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
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
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const body = await c.req.json().catch(() => null);
    const status = z
      .enum(['open', 'closed', 'archived'])
      .safeParse(body?.status);
    if (!status.success) return c.json({ error: 'Invalid request' }, 400);
    if (status.data === 'open') {
      const result = await openEvent(context, c.req.param('eventId'), {
        events: deps.events,
        classes: deps.classes,
        pricing: deps.pricing,
        consents: deps.eventConsents,
      });
      if (result.status === 'forbidden')
        return c.json({ error: 'Forbidden' }, 403);
      if (result.status === 'not-found')
        return c.json({ error: 'Not found' }, 404);
      if (result.status === 'not-ready') {
        const messages = {
          'class-required':
            'Zum Öffnen wird mindestens eine offene Klasse benötigt.',
          'price-required':
            'Zum Öffnen wird für mindestens eine offene Klasse ein Startgeld benötigt.',
          'participation-terms-required':
            'Zum Öffnen müssen veröffentlichte Teilnahmebedingungen hinterlegt sein.',
        };
        return c.json(
          { error: result.issues.map((issue) => messages[issue]).join(' ') },
          409,
        );
      }
      return c.json(EventResponse.parse(result.event));
    }
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
    const guard = await requireMember(c.req.raw, 'event:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    return c.json(
      await deps.pricing.listByEvent(context, c.req.param('eventId')),
    );
  });
  app.put('/admin/events/:eventId/pricing/:classId', async (c) => {
    const guard = await requireMember(c.req.raw, 'event:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const parsed = z
      .object({
        baseCents: z.number().int().nonnegative().optional(),
        additionalEntryAdjustmentCents: z.number().int().optional(),
        earlyBirdDeadline: z
          .string()
          .datetime({ offset: true })
          .nullable()
          .optional(),
        earlyBirdDiscountCents: z.number().int().nonnegative().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const classId = c.req.param('classId');
      const current =
        (await deps.pricing.listByEvent(context, c.req.param('eventId'))).find(
          (rule) => rule.classId === classId,
        ) ?? null;
      const merged = mergeClassPriceRule(classId, current, parsed.data);
      if (!merged.ok) return c.json({ error: 'Invalid price rule' }, 422);
      return c.json(
        await setClassPriceRule(context, c.req.param('eventId'), merged.rule, {
          pricing: deps.pricing,
        }),
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
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const parsed = CreateEventClassRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json(
        await createEventClass(
          context,
          c.req.param('eventId'),
          {
            ...parsed.data,
            passengerMode: parsed.data.passengerMode ?? 'optional',
          },
          {
            events: deps.events,
            classes: deps.classes,
          },
        ),
        201,
      );
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
  app.get('/admin/events/:eventId/classes', async (c) => {
    const guard = await requireMember(c.req.raw, 'event:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    return c.json(
      await deps.classes.listByEvent(context, c.req.param('eventId')),
    );
  });
  app.patch('/admin/events/:eventId/classes/:classId', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const parsed = UpdateEventClassRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await updateEventClass(
        context,
        c.req.param('eventId'),
        c.req.param('classId'),
        parsed.data as unknown as Partial<EventClassInput>,
        { events: deps.events, classes: deps.classes },
      );
      return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
}
