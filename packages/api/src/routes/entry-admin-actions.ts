import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import { performEntryAdminAction } from '@racepilot/core';

export function registerEntryAdminActionRoutes(
  context: ApiRoutesContext,
): void {
  const { app, deps, requireMember } = context;
  app.get('/admin/entries/:entryId', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const entry = await deps.entries.getById(context, c.req.param('entryId'));
    if (!entry) return c.json({ error: 'Not found' }, 404);
    const availableActions = context.permissions.has('entry:write')
      ? [
          ...((await deps.entryAdminActions.availableActions(
            context,
            entry.id,
          )) ?? []),
        ]
      : [];
    if (context.permissions.has('entry:write')) {
      const pinned = await deps.entryWorkflows.getPinnedForEntry(
        context,
        entry.id,
      );
      const currentStatus = entry.acceptanceStatus;
      for (const edge of pinned?.workflow.transitions ?? []) {
        if (edge.from !== currentStatus) continue;
        if (
          edge.roles?.length &&
          !edge.roles.some((role) => context.permissions.has(`role:${role}`))
        )
          continue;
        if (edge.permission && !context.permissions.has(edge.permission))
          continue;
        availableActions.push(`acceptance:${edge.to}`);
      }
    }
    return c.json({ ...entry, availableActions });
  });
  app.post('/admin/entries/:entryId/actions', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const entryId = z.string().uuid().safeParse(c.req.param('entryId'));
    const body = await c.req.json().catch(() => null);
    const parsed = z
      .discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('change_class'),
            classId: z.string().uuid(),
            reason: z.string().trim().max(1000),
            expectedVersion: z.number().int().min(1),
          })
          .strict(),
        z
          .object({
            kind: z.literal('adjust_amount'),
            amountCents: z.number().int(),
            reason: z.string().trim().max(1000),
            expectedVersion: z.number().int().min(1),
          })
          .strict(),
        z
          .object({
            kind: z.literal('note'),
            visibility: z.enum(['internal', 'driver']),
            text: z.string().trim().max(4000),
          })
          .strict(),
        z
          .object({
            kind: z.literal('delete'),
            reason: z.string().trim().max(1000),
            expectedVersion: z.number().int().min(1),
          })
          .strict(),
      ])
      .safeParse(body);
    if (!entryId.success || !parsed.success)
      return c.json({ error: 'Invalid request' }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}#${context.subject.subject}`
      : context.correlationId;
    const result = await performEntryAdminAction(
      context,
      entryId.data,
      parsed.data,
      actor,
      deps.entryAdminActions,
    );
    if (result.status === 'forbidden')
      return c.json({ error: 'Forbidden' }, 403);
    if (result.status === 'not_found')
      return c.json({ error: 'Not found' }, 404);
    if (result.status === 'invalid')
      return c.json({ error: result.reason }, 422);
    if (result.status === 'conflict')
      return c.json({ error: result.reason }, 409);
    return c.json({ updated: true });
  });
}
