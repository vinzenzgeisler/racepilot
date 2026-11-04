import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import {
  OrganizationPublicRegistrationRateLimitOverridesSchema,
  EventPublicRegistrationRateLimitOverridesSchema,
} from '@racepilot/contracts';

export function registerRegistrationRateLimitRoutes(
  context: ApiRoutesContext,
): void {
  const { app, deps, resolveMemberContext } = context;
  app.get('/admin/organization/public-registration-rate-limits', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.publicRegistrationRateLimits)
      return c.json({ error: 'Not found' }, 404);
    const settings =
      await deps.publicRegistrationRateLimits.getOrganization(context);
    return c.json(settings ?? {});
  });
  app.put('/admin/organization/public-registration-rate-limits', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:update'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.publicRegistrationRateLimits)
      return c.json({ error: 'Not found' }, 404);
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
      const context = await resolveMemberContext(c.req.raw);
      if (!context) return c.json({ error: 'Unauthorized' }, 401);
      if (!context.permissions.has('event:read'))
        return c.json({ error: 'Forbidden' }, 403);
      if (!deps.publicRegistrationRateLimits)
        return c.json({ error: 'Not found' }, 404);
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
      const context = await resolveMemberContext(c.req.raw);
      if (!context) return c.json({ error: 'Unauthorized' }, 401);
      if (!context.permissions.has('event:write'))
        return c.json({ error: 'Forbidden' }, 403);
      if (!deps.publicRegistrationRateLimits)
        return c.json({ error: 'Not found' }, 404);
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
