import type { ApiRoutesContext } from './context.js';
import { registerArtifactRoutes } from './artifact.js';
import { z } from 'zod';
import {
  transitionEntry,
  type EntryListQuery,
  type EntryStatusHintKey,
} from '@racepilot/core';

export function registerEntriesRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolveMemberContext } = context;
  registerArtifactRoutes(context);

  app.get('/admin/entries', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entries?.listAdmin) return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        eventId: z.string().uuid().optional(),
        classId: z.string().uuid().optional(),
        acceptanceStatus: z
          .string()
          .regex(/^[a-z][a-z0-9_-]{0,63}$/)
          .optional(),
        verificationStatus: z.enum(['unverified', 'verified']).optional(),
        paymentStatus: z
          .enum([
            'open',
            'partially_paid',
            'paid',
            'not_required',
            'not_relevant',
          ])
          .optional(),
        search: z.string().trim().max(120).optional(),
        sort: z
          .enum([
            'createdAt',
            'requestedStartNumber',
            'acceptanceStatus',
            'verificationStatus',
          ])
          .default('createdAt'),
        direction: z.enum(['asc', 'desc']).default('desc'),
      })
      .strict()
      .safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);
    const {
      eventId,
      classId,
      acceptanceStatus,
      verificationStatus,
      paymentStatus,
      search,
    } = parsed.data;
    const query: EntryListQuery = {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      sort: parsed.data.sort,
      direction: parsed.data.direction,
      ...(eventId ? { eventId } : {}),
      ...(classId ? { classId } : {}),
      ...(acceptanceStatus ? { acceptanceStatus } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
      ...(search ? { search } : {}),
    };
    const result = await deps.entries.listAdmin(context, query);
    return c.json({
      items: result.items,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / parsed.data.pageSize),
    });
  });
  app.get('/admin/entries/:entryId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entries) return c.json({ error: 'Not found' }, 404);
    const entry = await deps.entries.getById(context, c.req.param('entryId'));
    return entry ? c.json(entry) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/entries/:entryId/transitions', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.entries) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({
        transition: z.enum(['verification', 'acceptance']),
        status: z.string().min(1),
        reason: z.string().trim().max(1000).optional().default(''),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await transitionEntry(
        context,
        c.req.param('entryId'),
        parsed.data.transition,
        parsed.data.status,
        context.subject
          ? `${context.subject.issuer}#${context.subject.subject}`
          : context.correlationId,
        parsed.data.reason,
        {
          entries: deps.entries,
          ...(deps.entryWorkflows ? { workflows: deps.entryWorkflows } : {}),
        },
      );
      return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid transition' }, 403);
    }
  });
  app.post(
    '/admin/entries/:entryId/status-dimensions/:dimension/transitions',
    async (c) => {
      const context = await resolveMemberContext(c.req.raw);
      if (!context) return c.json({ error: 'Unauthorized' }, 401);
      if (!context.permissions.has('entry:write'))
        return c.json({ error: 'Forbidden' }, 403);
      if (!deps.entryStatusDimensions)
        return c.json({ error: 'Not found' }, 404);
      const dimension = z
        .enum(['technical_inspection', 'waiver'])
        .safeParse(c.req.param('dimension'));
      const parsed = z
        .object({
          status: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
          reason: z.string().trim().min(1).max(1000),
        })
        .strict()
        .safeParse(await c.req.json().catch(() => null));
      if (!dimension.success || !parsed.success)
        return c.json({ error: 'Invalid status transition' }, 400);
      const actor = context.subject
        ? `${context.subject.issuer}|${context.subject.subject}`
        : 'unknown';
      try {
        const updated = await deps.entryStatusDimensions.transition(
          context,
          c.req.param('entryId'),
          dimension.data,
          parsed.data.status,
          actor,
          parsed.data.reason,
        );
        return updated === null
          ? c.json({ error: 'Not found' }, 404)
          : c.json({ updated });
      } catch {
        return c.json({ error: 'Invalid status transition' }, 400);
      }
    },
  );
  app.put('/admin/entries/:entryId/status-hints', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entryStatusDimensions) return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({
        hints: z
          .object({
            double_starter: z.boolean().optional(),
            passenger: z.boolean().optional(),
            late_entry: z.boolean().optional(),
          })
          .strict()
          .refine((value) => Object.keys(value).length > 0),
        reason: z.string().trim().min(1).max(1000),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid status hints' }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : 'unknown';
    const updated = await deps.entryStatusDimensions.updateHints(
      context,
      c.req.param('entryId'),
      parsed.data.hints as Partial<Record<EntryStatusHintKey, boolean>>,
      actor,
      parsed.data.reason,
    );
    return updated
      ? c.json({ updated: true })
      : c.json({ error: 'Not found' }, 404);
  });
}
