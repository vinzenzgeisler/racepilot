import type { ApiRoutesContext } from './context.js';
import { registerRegistrationRateLimitRoutes } from './registration-rate-limits.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  validateEntryWorkflow,
  normalizeEntryWorkflow,
  validateEntryStatusDimensionConfig,
  EntryStatusInUseError,
} from '@racepilot/core';
import { EntryStatusDimensionConfigSchema } from '@racepilot/contracts';

const consentTerm = z
  .object({
    key: z.string().trim().min(1).max(80),
    version: z.string().trim().min(1).max(40),
    language: z.enum(['de', 'en']),
    text: z.string().min(1).max(20000),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    required: z.boolean().default(true),
  })
  .strict();

export function registerWorkflowRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolveMemberContext } = context;
  registerRegistrationRateLimitRoutes(context);

  app.get('/admin/events/:eventId/consents', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.eventConsents) return c.json({ error: 'Not found' }, 404);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Not found' }, 404);
    const terms = await deps.eventConsents.get(context, eventId);
    return terms ? c.json({ terms }) : c.json({ error: 'Not found' }, 404);
  });
  app.put('/admin/events/:eventId/consents', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.eventConsents) return c.json({ error: 'Not found' }, 404);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({ terms: z.array(consentTerm).max(30) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (
      !parsed.success ||
      parsed.data.terms.some(
        (term) =>
          createHash('sha256').update(term.text).digest('hex') !== term.hash,
      )
    )
      return c.json({ error: 'Invalid request' }, 400);
    if (
      new Set(parsed.data.terms.map((term) => `${term.key}:${term.language}`))
        .size !== parsed.data.terms.length
    )
      return c.json({ error: 'Invalid request' }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : context.correlationId;
    const terms = await deps.eventConsents.update(
      context,
      eventId,
      parsed.data.terms,
      actor,
    );
    return terms ? c.json({ terms }) : c.json({ error: 'Not found' }, 404);
  });
  app.get('/admin/organization/registration-workflow', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entryWorkflows) return c.json({ error: 'Not found' }, 404);
    const revision = await deps.entryWorkflows.getOrganization(context);
    return revision ? c.json(revision) : c.json({ error: 'Not found' }, 404);
  });
  app.put('/admin/organization/registration-workflow', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:update'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entryWorkflows) return c.json({ error: 'Not found' }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      workflow?: unknown;
      reason?: unknown;
    } | null;
    if (
      !body ||
      typeof body.reason !== 'string' ||
      !body.reason.trim() ||
      !body.workflow ||
      typeof body.workflow !== 'object'
    )
      return c.json({ error: 'Invalid request' }, 400);
    const candidate = body.workflow as {
      version?: unknown;
      statuses?: unknown;
      transitions?: unknown;
    };
    if (
      !Number.isInteger(candidate.version) ||
      !Array.isArray(candidate.statuses) ||
      !Array.isArray(candidate.transitions)
    )
      return c.json({ error: 'Invalid workflow' }, 400);
    let errors: string[];
    try {
      errors = validateEntryWorkflow(
        candidate as import('@racepilot/core').EntryWorkflow,
      );
    } catch {
      return c.json({ error: 'Invalid workflow' }, 400);
    }
    if (errors.length)
      return c.json({ error: 'Invalid workflow', details: errors }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : 'unknown';
    return c.json(
      await deps.entryWorkflows.setOrganization(
        context,
        normalizeEntryWorkflow(
          candidate as import('@racepilot/core').EntryWorkflow,
        ),
        actor,
        body.reason,
      ),
    );
  });
  app.get('/admin/events/:eventId/registration-workflow', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entryWorkflows) return c.json({ error: 'Not found' }, 404);
    const revision = await deps.entryWorkflows.getEffective(
      context,
      c.req.param('eventId'),
    );
    return revision ? c.json(revision) : c.json({ error: 'Not found' }, 404);
  });
  app.put('/admin/events/:eventId/registration-workflow', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entryWorkflows) return c.json({ error: 'Not found' }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      workflow?: unknown;
      reason?: unknown;
    } | null;
    if (
      !body ||
      typeof body.reason !== 'string' ||
      !body.reason.trim() ||
      !body.workflow ||
      typeof body.workflow !== 'object'
    )
      return c.json({ error: 'Invalid request' }, 400);
    const candidate = body.workflow as {
      version?: unknown;
      statuses?: unknown;
      transitions?: unknown;
    };
    if (
      !Number.isInteger(candidate.version) ||
      !Array.isArray(candidate.statuses) ||
      !Array.isArray(candidate.transitions)
    )
      return c.json({ error: 'Invalid workflow' }, 400);
    let errors: string[];
    try {
      errors = validateEntryWorkflow(
        candidate as import('@racepilot/core').EntryWorkflow,
      );
    } catch {
      return c.json({ error: 'Invalid workflow' }, 400);
    }
    if (errors.length)
      return c.json({ error: 'Invalid workflow', details: errors }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : 'unknown';
    const revision = await deps.entryWorkflows.setEvent(
      context,
      c.req.param('eventId'),
      normalizeEntryWorkflow(
        candidate as import('@racepilot/core').EntryWorkflow,
      ),
      actor,
      body.reason,
    );
    return revision ? c.json(revision) : c.json({ error: 'Not found' }, 404);
  });
  app.get('/admin/events/:eventId/status-dimensions', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entryStatusDimensions) return c.json({ error: 'Not found' }, 404);
    const config = await deps.entryStatusDimensions.getEvent(
      context,
      c.req.param('eventId'),
    );
    return config
      ? c.json(EntryStatusDimensionConfigSchema.parse(config))
      : c.json({ error: 'Not found' }, 404);
  });
  app.put('/admin/events/:eventId/status-dimensions', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entryStatusDimensions) return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({
        config: EntryStatusDimensionConfigSchema,
        reason: z.string().trim().min(1).max(1000),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Invalid status dimensions' }, 400);
    const errors = validateEntryStatusDimensionConfig(parsed.data.config);
    if (errors.length)
      return c.json(
        { error: 'Invalid status dimensions', details: errors },
        400,
      );
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : 'unknown';
    try {
      const config = await deps.entryStatusDimensions.setEvent(
        context,
        c.req.param('eventId'),
        parsed.data.config,
        actor,
        parsed.data.reason,
      );
      return config ? c.json(config) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof EntryStatusInUseError)
        return c.json(
          {
            error: 'Status is in use',
            dimension: error.dimension,
            status: error.status,
          },
          409,
        );
      throw error;
    }
  });
}
