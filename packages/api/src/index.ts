import { Hono } from 'hono';
import { z } from 'zod';
import {
  parseDeploymentMode,
  createRequestContext,
  organizationId,
  getOrganization,
  getEvent,
  updateOrganization,
  createEvent,
  updateEvent,
  transitionEvent,
  getPublicEvent,
  createEventClass,
  updateEventClass,
  type EventClassRepository,
  type EventClassInput,
  transitionEntry,
  type EntryRepository,
  type OrganizationRepository,
  type EventRepository,
  type OrganizationPatch,
  type MembershipRepository,
  type MembershipBootstrap,
  type ExternalIdentity,
} from '@racepilot/core';
import {
  healthResponseSchema,
  OrganizationResponse,
  UpdateOrganizationRequest,
  CreateEventRequest,
  EventResponse,
  CreateEventClassRequest,
  UpdateEventClassRequest,
} from '@racepilot/contracts';
export function health(version: string) {
  return healthResponseSchema.parse({ status: 'ok', version });
}
export function deploymentModeFromConfig(configured: string) {
  return parseDeploymentMode(configured);
}
const configSchema = z.object({
  DEPLOYMENT_MODE: z.literal('community'),
  DATABASE_URL: z.string().url(),
  COMMUNITY_ORGANIZATION_SLUG: z.string().min(1),
  COMMUNITY_ORGANIZATION_NAME: z.string().min(1),
  COMMUNITY_ORGANIZATION_TIMEZONE: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  COMMUNITY_ORGANIZATION_LOCALE: z.string().refine((value) => {
    try {
      return Intl.getCanonicalLocales(value).length === 1;
    } catch {
      return false;
    }
  }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MAIL_PROVIDER: z.enum(['disabled', 'smtp']).default('disabled'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  STORAGE_PROVIDER: z.enum(['disabled', 'local']).default('disabled'),
  STORAGE_LOCAL_ROOT: z.string().optional(),
  OIDC_PROVIDER: z.enum(['disabled', 'oidc']).default('disabled'),
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_AUDIENCE: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  OIDC_BOOTSTRAP_SUBJECT: z.string().optional(),
  OIDC_BOOTSTRAP_EMAIL: z.string().email().optional(),
});
export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const names = [
      ...new Set(
        parsed.error.issues.map((i) => String(i.path[0] ?? 'configuration')),
      ),
    ];
    throw new Error(`Invalid configuration variables: ${names.join(', ')}`);
  }
  if (
    parsed.data.MAIL_PROVIDER === 'smtp' &&
    (!parsed.data.SMTP_HOST ||
      !parsed.data.SMTP_PORT ||
      !parsed.data.SMTP_FROM ||
      Boolean(parsed.data.SMTP_USER) !== Boolean(parsed.data.SMTP_PASSWORD))
  ) {
    throw new Error(
      'Invalid configuration variables: SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD',
    );
  }
  if (parsed.data.OIDC_PROVIDER === 'oidc') {
    const d = parsed.data;
    if (
      !d.OIDC_ISSUER_URL ||
      !d.OIDC_AUDIENCE ||
      !d.OIDC_CLIENT_ID ||
      !d.OIDC_REDIRECT_URI ||
      Boolean(d.OIDC_BOOTSTRAP_SUBJECT) === Boolean(d.OIDC_BOOTSTRAP_EMAIL)
    )
      throw new Error(
        'Invalid configuration variables: OIDC_ISSUER_URL, OIDC_AUDIENCE, OIDC_CLIENT_ID, OIDC_REDIRECT_URI, OIDC_BOOTSTRAP_SUBJECT or OIDC_BOOTSTRAP_EMAIL',
      );
    try {
      const issuer = new URL(d.OIDC_ISSUER_URL);
      if (
        !['https:', 'http:'].includes(issuer.protocol) ||
        issuer.username ||
        issuer.password
      )
        throw new Error();
    } catch {
      throw new Error('Invalid configuration variables: OIDC_ISSUER_URL');
    }
  }
  if (
    parsed.data.STORAGE_PROVIDER === 'local' &&
    !parsed.data.STORAGE_LOCAL_ROOT
  ) {
    throw new Error('Invalid configuration variables: STORAGE_LOCAL_ROOT');
  }
  return {
    ...parsed.data,
    mailEnabled: parsed.data.MAIL_PROVIDER === 'smtp',
    storageEnabled: parsed.data.STORAGE_PROVIDER === 'local',
    deploymentMode: parseDeploymentMode(parsed.data.DEPLOYMENT_MODE),
  };
}
export interface Authenticator {
  authenticate(request: Request): Promise<ExternalIdentity | null>;
}
export interface ApiDeps {
  config: { deploymentMode: 'community'; organizationId: string };
  organizations: OrganizationRepository;
  events: EventRepository;
  classes?: EventClassRepository;
  entries?: EntryRepository;
  authenticator?: Authenticator;
  memberships?: MembershipRepository;
  bootstrap?: MembershipBootstrap;
  oidcClient?: { issuerUrl: string; clientId: string; redirectUri: string };
}
export function createApp(deps: ApiDeps) {
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/auth/config', (c) => c.json({ oidc: deps.oidcClient ?? null }));
  const resolveContext = async (request: Request) => {
    const identity =
      (await deps.authenticator?.authenticate(request).catch(() => null)) ??
      null;
    if (!identity) return null;
    const permissions =
      (await deps.memberships
        ?.resolvePermissions(
          identity,
          organizationId(deps.config.organizationId),
          deps.bootstrap,
        )
        .catch(() => new Set<string>())) ?? new Set<string>();
    return createRequestContext({
      deploymentMode: 'community',
      organizationId: organizationId(deps.config.organizationId),
      subject: { issuer: identity.issuer, subject: identity.subject },
      permissions,
      capabilities: new Set(),
      correlationId: crypto.randomUUID(),
    });
  };
  app.get('/admin/organization', async (c) => {
    const context = await resolveContext(c.req.raw);
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
    const context = await resolveContext(c.req.raw);
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
  app.get('/admin/events/:eventId', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Invalid event ID' }, 400);
    try {
      const event = await getEvent(context, eventId, { events: deps.events });
      return event ? c.json(event) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden' }, 403);
    }
  });
  app.get('/admin/events', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    return c.json(await deps.events.listByOrganization(context));
  });
  app.post('/admin/events', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    const parsed = CreateEventRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json(
        EventResponse.parse(
          await createEvent(
            context,
            parsed.data as import('@racepilot/core').EventInput,
            { events: deps.events },
          ),
        ),
        201,
      );
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
  app.patch('/admin/events/:eventId', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const result = await updateEvent(
        context,
        c.req.param('eventId'),
        await c.req.json(),
        { events: deps.events },
      );
      return result
        ? c.json(EventResponse.parse(result))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
  app.post('/admin/events/:eventId/transitions', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json().catch(() => null);
    const status = z
      .enum(['open', 'closed', 'archived'])
      .safeParse(body?.status);
    if (!status.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await transitionEvent(
        context,
        c.req.param('eventId'),
        status.data,
        new Date(),
        { events: deps.events },
      );
      return result
        ? c.json(EventResponse.parse(result))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid transition' }, 403);
    }
  });
  app.get('/admin/entries/:entryId', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.entries) return c.json({ error: 'Not found' }, 404);
    const entry = await deps.entries.getById(context, c.req.param('entryId'));
    return entry ? c.json(entry) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/entries/:entryId/transitions', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.entries) return c.json({ error: 'Not found' }, 404);
    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({
        transition: z.enum(['verification', 'acceptance']),
        status: z.string().min(1),
        reason: z.string().trim().min(1).max(1000),
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
        { entries: deps.entries },
      );
      return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid transition' }, 403);
    }
  });
  app.get('/public/events/:organizationId/:slug', async (c) => {
    const orgId = c.req.param('organizationId');
    if (
      !z.string().uuid().safeParse(orgId).success ||
      orgId !== deps.config.organizationId
    )
      return c.json({ error: 'Not found' }, 404);
    const context = createRequestContext({
      deploymentMode: 'community',
      organizationId: organizationId(deps.config.organizationId),
      permissions: new Set(),
      capabilities: new Set(),
      correlationId: crypto.randomUUID(),
    });
    const event = await getPublicEvent(
      context,
      c.req.param('slug'),
      new Date(),
      { events: deps.events },
    );
    return event ? c.json(event) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/events/:eventId/classes', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.classes) return c.json({ error: 'Not found' }, 404);
    const parsed = CreateEventClassRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json(
        await createEventClass(context, c.req.param('eventId'), parsed.data, {
          events: deps.events,
          classes: deps.classes,
        }),
        201,
      );
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
  app.get('/admin/events/:eventId/classes', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.classes) return c.json({ error: 'Not found' }, 404);
    return c.json(
      await deps.classes.listByEvent(context, c.req.param('eventId')),
    );
  });
  app.patch('/admin/events/:eventId/classes/:classId', async (c) => {
    const context = await resolveContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.classes) return c.json({ error: 'Not found' }, 404);
    const parsed = UpdateEventClassRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await updateEventClass(
        context,
        c.req.param('eventId'),
        c.req.param('classId'),
        parsed.data as Partial<EventClassInput>,
        { events: deps.events, classes: deps.classes },
      );
      return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid request' }, 403);
    }
  });
  return app;
}
