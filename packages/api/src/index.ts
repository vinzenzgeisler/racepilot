import { Hono } from 'hono';
import { z } from 'zod';
import {
  parseDeploymentMode,
  createRequestContext,
  organizationId,
  getOrganization,
  getEvent,
  updateOrganization,
  type OrganizationRepository,
  type EventRepository,
  type OrganizationPatch,
} from '@racepilot/core';
import {
  healthResponseSchema,
  OrganizationResponse,
  UpdateOrganizationRequest,
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
  return {
    ...parsed.data,
    deploymentMode: parseDeploymentMode(parsed.data.DEPLOYMENT_MODE),
  };
}
export interface Authenticator {
  authenticate(request: Request): Promise<{
    issuer: string;
    subject: string;
    permissions: ReadonlySet<string>;
  } | null>;
}
export interface ApiDeps {
  config: { deploymentMode: 'community'; organizationId: string };
  organizations: OrganizationRepository;
  events: EventRepository;
  authenticator?: Authenticator;
}
export function createCommunityContextResolver(
  config: ApiDeps['config'],
  identity: {
    issuer: string;
    subject: string;
    permissions: ReadonlySet<string>;
  } | null,
) {
  return createRequestContext({
    deploymentMode: 'community',
    organizationId: organizationId(config.organizationId),
    ...(identity
      ? { subject: { issuer: identity.issuer, subject: identity.subject } }
      : {}),
    permissions: identity?.permissions ?? new Set(),
    capabilities: new Set(),
    correlationId: crypto.randomUUID(),
  });
}
export function createApp(deps: ApiDeps) {
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/admin/organization', async (c) => {
    const identity = await (deps.authenticator?.authenticate(c.req.raw) ??
      Promise.resolve(null));
    if (!identity) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const org = await getOrganization(
        createCommunityContextResolver(deps.config, identity),
        { organizations: deps.organizations },
      );
      return org
        ? c.json(OrganizationResponse.parse(org))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden' }, 403);
    }
  });
  app.patch('/admin/organization', async (c) => {
    const identity = await (deps.authenticator?.authenticate(c.req.raw) ??
      Promise.resolve(null));
    if (!identity) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json().catch(() => null);
    const parsed = UpdateOrganizationRequest.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const org = await updateOrganization(
        createCommunityContextResolver(deps.config, identity),
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
    const identity = await (deps.authenticator?.authenticate(c.req.raw) ??
      Promise.resolve(null));
    if (!identity) return c.json({ error: 'Unauthorized' }, 401);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Invalid event ID' }, 400);
    try {
      const event = await getEvent(
        createCommunityContextResolver(deps.config, identity),
        eventId,
        { events: deps.events },
      );
      return event ? c.json(event) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden' }, 403);
    }
  });
  return app;
}
