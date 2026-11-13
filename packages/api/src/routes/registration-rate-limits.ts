import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import {
  OrganizationPublicRegistrationRateLimitOverridesSchema,
  EventPublicRegistrationRateLimitOverridesSchema,
} from '@racepilot/contracts';

export function registerRegistrationRateLimitRoutes(
  context: ApiRoutesContext,
): void {
  const { app, deps, requireMember } = context;
  app.get('/admin/organization/public-registration-rate-limits', async (c) => {
    const guard = await requireMember(c.req.raw, 'organization:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const settings =
      await deps.publicRegistrationRateLimits.getOrganization(context);
    return c.json(settings ?? {});
  });
  app.put('/admin/organization/public-registration-rate-limits', async (c) => {
    const guard = await requireMember(c.req.raw, 'organization:update');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const parsed =
      OrganizationPublicRegistrationRateLimitOverridesSchema.safeParse(
        await c.req.json().catch(() => null),
      );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : context.correlationId;
    return c.json(
      (await deps.publicRegistrationRateLimits.updateOrganization(
        context,
        parsed.data,
        actor,
      )) ?? {},
    );
  });
  app.get(
    '/admin/events/:eventId/public-registration-rate-limits',
    async (c) => {
      const guard = await requireMember(c.req.raw, 'event:read');
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const context = guard.context;
      const eventId = c.req.param('eventId');
      if (!z.string().uuid().safeParse(eventId).success)
        return c.json({ error: 'Not found' }, 404);
      if (!(await deps.events.getById(context, eventId)))
        return c.json({ error: 'Not found' }, 404);
      return c.json(
        (await deps.publicRegistrationRateLimits.getEvent(context, eventId)) ??
          {},
      );
    },
  );
  app.put(
    '/admin/events/:eventId/public-registration-rate-limits',
    async (c) => {
      const guard = await requireMember(c.req.raw, 'event:write');
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const context = guard.context;
      const eventId = c.req.param('eventId');
      if (!z.string().uuid().safeParse(eventId).success)
        return c.json({ error: 'Not found' }, 404);
      const parsed = EventPublicRegistrationRateLimitOverridesSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
      if (!(await deps.events.getById(context, eventId)))
        return c.json({ error: 'Not found' }, 404);
      const actor = context.subject
        ? `${context.subject.issuer}|${context.subject.subject}`
        : context.correlationId;
      const result = await deps.publicRegistrationRateLimits.updateEvent(
        context,
        eventId,
        parsed.data,
        actor,
      );
      return c.json(result ?? {});
    },
  );
}
