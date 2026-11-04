import type { ApiRoutesContext } from './context.js';
import { registerRegistrationAssetRoutes } from './registration-assets.js';

import { z } from 'zod';

import { resolveRegistrationRateLimits } from '../rate-limit.js';
import { createRequestContext, ProviderError } from '@racepilot/core';
import {
  PublicRegistrationRequestSchema,
  SaveRegistrationDraftRequestSchema,
} from '@racepilot/contracts';

export function registerPublicRegistrationRoutes(
  context: ApiRoutesContext,
): void {
  const {
    app,
    deps,
    resolvePublicContext,
    consumeRegistrationBudget,
    setRetryAfter,
    rateLimitDefaults,
  } = context;
  registerRegistrationAssetRoutes(context);

  app.post(
    '/public/organizations/:organizationId/events/:slug/registration/submissions',
    async (c) => {
      const orgId = c.req.param('organizationId');
      const context = await resolvePublicContext(c.req.raw);
      if (
        !context ||
        orgId !== context.organizationId ||
        !z.string().uuid().safeParse(orgId).success
      )
        return c.json({ error: 'Registration unavailable' }, 404);
      const eventSlug = c.req.param('slug');
      let configuredRateLimits;
      try {
        configuredRateLimits =
          await deps.publicRegistrationRateLimits!.resolvePublicEvent(
            context,
            eventSlug,
          );
      } catch {
        return c.json({ error: 'Registration unavailable' }, 503);
      }
      if (!configuredRateLimits)
        return c.json({ error: 'Registration unavailable' }, 404);
      const effectiveRateLimits = resolveRegistrationRateLimits(
        rateLimitDefaults,
        configuredRateLimits.organization,
        configuredRateLimits.event,
      );
      const budget = await consumeRegistrationBudget(c, [
        {
          key: `organization:${orgId}`,
          ...effectiveRateLimits.organization,
        },
        {
          key: `event:${orgId}:${configuredRateLimits.eventId}`,
          ...effectiveRateLimits.event,
        },
      ]);
      if (budget.unavailable)
        return c.json({ error: 'Registration unavailable' }, 503);
      if (!budget.allowed) {
        setRetryAfter(c, budget.retryAfterMs);
        return c.json({ error: 'Registration unavailable' }, 429);
      }
      const payload = PublicRegistrationRequestSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!payload.success || payload.data.eventSlug !== eventSlug)
        return c.json({ error: 'Invalid registration' }, 400);
      if (!deps.publicRegistration)
        return c.json({ error: 'Registration unavailable' }, 503);
      const submissionContext = createRequestContext({
        ...context,
        correlationId: payload.data.submissionId,
      });
      try {
        return c.json(
          await deps.publicRegistration.submit(
            submissionContext,
            c.req.param('slug'),
            payload.data,
          ),
          202,
        );
      } catch (error) {
        if (error instanceof ProviderError && error.code === 'conflict')
          return c.json({ error: 'Submission ID conflict' }, 409);
        return c.json({ error: 'Registration unavailable' }, 400);
      }
    },
  );
  app.get(
    '/public/organizations/:organizationId/events/:slug/registration/start-number',
    async (c) => {
      const context = await resolvePublicContext(c.req.raw);
      if (
        !context ||
        c.req.param('organizationId') !== context.organizationId ||
        !deps.publicRegistration?.checkRequestedStartNumber
      )
        return c.json({ error: 'Not found' }, 404);
      const number = z
        .string()
        .trim()
        .min(1)
        .max(64)
        .safeParse(c.req.query('number'));
      if (!number.success) return c.json({ error: 'Invalid number' }, 400);
      try {
        const result = await deps.publicRegistration.checkRequestedStartNumber(
          context,
          c.req.param('slug'),
          number.data,
        );
        return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
      } catch {
        return c.json({ error: 'Registration unavailable' }, 503);
      }
    },
  );
  app.post(
    '/public/organizations/:organizationId/events/:slug/registration/drafts',
    async (c) => {
      const context = await resolvePublicContext(c.req.raw);
      const organizationParam = c.req.param('organizationId');
      const eventSlug = c.req.param('slug');
      if (
        !context ||
        organizationParam !== context.organizationId ||
        !deps.publicRegistration?.saveDraft ||
        !deps.publicRegistrationRateLimits
      )
        return c.json({ error: 'Registration unavailable' }, 404);
      const parsed = SaveRegistrationDraftRequestSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success || parsed.data.eventSlug !== eventSlug)
        return c.json({ error: 'Invalid draft' }, 400);
      let configured;
      try {
        configured = await deps.publicRegistrationRateLimits.resolvePublicEvent(
          context,
          eventSlug,
        );
      } catch {
        return c.json({ error: 'Registration unavailable' }, 503);
      }
      if (!configured) return c.json({ sent: true }, 202);
      const limits = resolveRegistrationRateLimits(
        rateLimitDefaults,
        configured.organization,
        configured.event,
      );
      const budget = await consumeRegistrationBudget(c, [
        {
          key: `organization:${context.organizationId}`,
          ...limits.organization,
        },
        {
          key: `event:${context.organizationId}:${configured.eventId}`,
          ...limits.event,
        },
      ]);
      if (budget.unavailable)
        return c.json({ error: 'Registration unavailable' }, 503);
      if (!budget.allowed) {
        setRetryAfter(c, budget.retryAfterMs);
        return c.json({ error: 'Registration unavailable' }, 429);
      }
      try {
        await deps.publicRegistration.saveDraft(
          context,
          eventSlug,
          parsed.data.draft.email,
          parsed.data.language,
          parsed.data.draft,
        );
      } catch {
        /* intentionally avoid event/email enumeration */
      }
      return c.json({ sent: true }, 202);
    },
  );
}
