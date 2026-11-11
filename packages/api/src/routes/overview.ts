import { z } from 'zod';
import { getEventOverview } from '@racepilot/core';
import type { ApiRoutesContext } from './context.js';

export function registerOverviewRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolveMemberContext } = context;
  app.get('/admin/events/:eventId/overview', async (c) => {
    const requestContext = await resolveMemberContext(c.req.raw);
    if (!requestContext) return c.json({ error: 'Unauthorized' }, 401);
    if (!requestContext.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Not found' }, 404);
    if (!deps.overview) return c.json({ error: 'Not found' }, 404);
    const result = await getEventOverview(
      requestContext,
      deps.overview,
      eventId,
    );
    if (result.ok) {
      c.header('Cache-Control', 'private, no-store');
      return c.json(result.overview);
    }
    switch (result.error) {
      case 'event-not-found':
        return c.json({ error: 'Not found' }, 404);
      default: {
        const exhaustive: never = result.error;
        return exhaustive;
      }
    }
  });
}
