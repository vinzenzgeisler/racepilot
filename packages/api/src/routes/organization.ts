import type { ApiRoutesContext } from './context.js';
import {
  getOrganization,
  updateOrganization,
  type OrganizationPatch,
} from '@racepilot/core';
import {
  OrganizationResponse,
  UpdateOrganizationRequest,
} from '@racepilot/contracts';

export function registerOrganizationRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolveMemberContext } = context;
  app.get('/admin/organization', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const org = await getOrganization(context, {
        organizations: deps.organizations,
      });
      return org
        ? c.json(OrganizationResponse.parse(org))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden' }, 403);
    }
  });
  app.patch('/admin/organization', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json().catch(() => null);
    const parsed = UpdateOrganizationRequest.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const org = await updateOrganization(
        context,
        parsed.data as OrganizationPatch,
        { organizations: deps.organizations },
      );
      return org
        ? c.json(OrganizationResponse.parse(org))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden' }, 403);
    }
  });
}
