import { z } from 'zod';
import {
  AdminPassengerCreateRequest,
  AdminPassengerLinkRequest,
  PassengerCompletionRequest,
  PassengerLinkResolveRequest,
} from '@racepilot/contracts';
import type {
  ApiRoutesContext,
  PublicRegistrationRouteDeps,
} from './context.js';

const adminActor = (context: {
  subject?: { issuer: string; subject: string } | undefined;
  correlationId: string;
}) =>
  context.subject
    ? `${context.subject.issuer}#${context.subject.subject}`
    : context.correlationId;

/** The office adds a co-driver or creates the co-driver's personal link; `entry:write` only. */
export function registerPassengerAdminRoutes({
  app,
  deps,
  requireMember,
}: ApiRoutesContext): void {
  const passengers = deps.passengers;
  if (!passengers) return;
  app.post('/admin/entries/:entryId/passenger', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const entryId = z.string().uuid().safeParse(c.req.param('entryId'));
    const parsed = AdminPassengerCreateRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!entryId.success || !parsed.success)
      return c.json({ error: 'Invalid request' }, 400);
    const result = await passengers.admin.add(
      guard.context,
      entryId.data,
      parsed.data,
      adminActor(guard.context),
    );
    if (result.status === 'not_found')
      return c.json({ error: 'Not found' }, 404);
    if (result.status === 'exists')
      return c.json({ error: 'Passenger exists' }, 409);
    if (result.status === 'unavailable')
      return c.json({ error: 'Passenger unavailable' }, 422);
    return c.json({ created: true }, 201);
  });
  app.post('/admin/entries/:entryId/passenger/link', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const entryId = z.string().uuid().safeParse(c.req.param('entryId'));
    const parsed = AdminPassengerLinkRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!entryId.success || !parsed.success)
      return c.json({ error: 'Invalid request' }, 400);
    const result = await passengers.admin.issueLink(
      guard.context,
      entryId.data,
      parsed.data,
      adminActor(guard.context),
    );
    if (result.status === 'not_found')
      return c.json({ error: 'Not found' }, 404);
    if (result.status === 'completed')
      return c.json({ error: 'Passenger completed' }, 409);
    if (result.status !== 'created')
      return c.json({ error: result.status }, 422);
    return c.json(
      {
        url: result.url,
        expiresAt: result.expiresAt,
        mailQueued: result.mailQueued,
      },
      201,
    );
  });
}

/**
 * Link-based access for the co-driver, without an account. Both calls are rate-limited per client;
 * an unknown, expired, used or foreign token answers with the same 404.
 */
export function registerPassengerPublicRoutes(
  { app, deps, resolvePublicContext }: ApiRoutesContext,
  registration: PublicRegistrationRouteDeps,
): void {
  const passengers = deps.passengers;
  if (!passengers) return;
  const { consumeRegistrationBudget, setRetryAfter } = registration;
  const limited = async (
    c: Parameters<typeof consumeRegistrationBudget>[0] &
      Parameters<typeof setRetryAfter>[0],
    organizationId: string,
    scope: string,
    limit: number,
  ) => {
    const budget = await consumeRegistrationBudget(c, [
      { key: `${scope}:${organizationId}`, limit, windowMs: 60_000 },
    ]);
    if (budget.unavailable) return 503;
    if (!budget.allowed) {
      setRetryAfter(c, budget.retryAfterMs);
      return 429;
    }
    return null;
  };
  app.post('/public/passenger-links/resolve', async (c) => {
    const context = await resolvePublicContext(c.req.raw);
    if (!context) return c.json({ error: 'Link unavailable' }, 404);
    const blocked = await limited(
      c as never,
      context.organizationId,
      'passenger-link',
      30,
    );
    if (blocked) return c.json({ error: 'Link unavailable' }, blocked);
    const parsed = PassengerLinkResolveRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Link unavailable' }, 404);
    try {
      const view = await passengers.public.resolve(context, parsed.data.token);
      return view ? c.json(view) : c.json({ error: 'Link unavailable' }, 404);
    } catch {
      return c.json({ error: 'Link unavailable' }, 404);
    }
  });
  app.post('/public/passenger-links/complete', async (c) => {
    const context = await resolvePublicContext(c.req.raw);
    if (!context) return c.json({ error: 'Link unavailable' }, 404);
    const blocked = await limited(
      c as never,
      context.organizationId,
      'passenger-complete',
      10,
    );
    if (blocked) return c.json({ error: 'Link unavailable' }, blocked);
    const parsed = PassengerCompletionRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await passengers.public.complete(
        context,
        parsed.data.token,
        parsed.data.language,
        parsed.data.passenger,
        parsed.data.consents,
      );
      if (result === 'completed') return c.json({ completed: true });
      if (result === 'unavailable')
        return c.json({ error: 'Link unavailable' }, 404);
      if (result === 'guardian_required')
        return c.json({ error: 'guardian_required' }, 422);
      return c.json({ error: result }, 400);
    } catch {
      return c.json({ error: 'Link unavailable' }, 404);
    }
  });
}
