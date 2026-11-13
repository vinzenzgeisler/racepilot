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
  const { app, deps, requireMember } = context;
  app.get('/admin/session', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const member = guard.context;
    const role = member.permissions.has('role:admin')
      ? 'admin'
      : member.permissions.has('role:member')
        ? 'member'
        : null;
    return role ? c.json({ role }) : c.json({ error: 'Forbidden' }, 403);
  });
  app.get('/admin/organization', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
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
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
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
