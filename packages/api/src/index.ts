import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import type { RequestContext, DeploymentMode } from '@racepilot/core';
import { z } from 'zod';
import { installModules, type ModuleApiDeps } from './modules.js';
import { resolveOrganizationModuleCapabilities } from '@racepilot/core';
export * from './modules.js';
import { mailConfigSchema, validateMailConfig } from '@racepilot/contracts';
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
  recordInvoicePayment,
  correctInvoicePayment,
  updatePaymentRecipient,
  setClassPriceRule,
  validatePaymentRecipient,
  type EventClassPricingRepository,
  type PaymentRecipientRepository,
  type InvoicePaymentRepository,
  type EntryRepository,
  type EntryWorkflowRepository,
  validateEntryWorkflow,
  type EntryListQuery,
  type EntryExportRepository,
  type EntryConfirmationRepository,
  type ArtifactJobRepository,
  type ObjectStorageProvider,
  entryExportFields,
  type OrganizationRepository,
  type EventRepository,
  type OrganizationPatch,
  type MembershipRepository,
  type MembershipBootstrap,
  type ExternalIdentity,
  ProviderError,
} from '@racepilot/core';
import {
  healthResponseSchema,
  OrganizationResponse,
  UpdateOrganizationRequest,
  RuntimeBootstrapResponse,
  CreateEventRequest,
  EventResponse,
  CreateEventClassRequest,
  UpdateEventClassRequest,
  RegistrationSettingsSchema,
  type RegistrationSettings,
  standardRegistrationForm,
  PublicRegistrationRequestSchema,
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
  ...mailConfigSchema.shape,
  STORAGE_PROVIDER: z.enum(['disabled', 'local', 's3']).default('disabled'),
  STORAGE_LOCAL_ROOT: z.string().optional(),
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_REGION: z.string().optional(),
  STORAGE_S3_ENDPOINT: z.string().url().optional(),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
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
  const mailConfig = validateMailConfig(env);
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
  )
    throw new Error('Invalid configuration variables: STORAGE_LOCAL_ROOT');
  if (parsed.data.STORAGE_PROVIDER === 's3' && !parsed.data.STORAGE_S3_BUCKET)
    throw new Error('Invalid configuration variables: STORAGE_S3_BUCKET');
  if (
    Boolean(parsed.data.STORAGE_S3_ACCESS_KEY_ID) !==
    Boolean(parsed.data.STORAGE_S3_SECRET_ACCESS_KEY)
  )
    throw new Error(
      'Invalid configuration variables: STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY',
    );
  return {
    ...parsed.data,
    ...mailConfig,
    mailEnabled:
      parsed.data.MAIL_PROVIDER === 'smtp' &&
      Boolean(parsed.data.CANONICAL_BASE_URL),
    storageEnabled: parsed.data.STORAGE_PROVIDER !== 'disabled',
    deploymentMode: parseDeploymentMode(parsed.data.DEPLOYMENT_MODE),
  };
}
export interface Authenticator {
  authenticate(request: Request): Promise<ExternalIdentity | null>;
}
export interface ApiDeps {
  config: { deploymentMode: DeploymentMode; organizationId?: string };
  organizations: OrganizationRepository;
  events: EventRepository;
  classes?: EventClassRepository;
  entries?: EntryRepository;
  entryExports?: EntryExportRepository;
  entryConfirmations?: EntryConfirmationRepository;
  artifactJobs?: ArtifactJobRepository;
  objectStorage?: ObjectStorageProvider;
  payments?: InvoicePaymentRepository;
  paymentRecipients?: PaymentRecipientRepository;
  pricing?: EventClassPricingRepository;
  entryWorkflows?: EntryWorkflowRepository;
  registrationSettings?: {
    get(
      context: import('@racepilot/core').RequestContext,
    ): Promise<RegistrationSettings>;
    update(
      context: import('@racepilot/core').RequestContext,
      settings: RegistrationSettings,
      actor: string,
    ): Promise<RegistrationSettings>;
  };
  publicRegistration?: {
    getForm(
      context: import('@racepilot/core').RequestContext,
      eventSlug: string,
    ): Promise<unknown | null>;
    submit(
      context: import('@racepilot/core').RequestContext,
      eventSlug: string,
      payload: import('@racepilot/contracts').PublicRegistrationRequest,
    ): Promise<unknown>;
    verify(
      context: import('@racepilot/core').RequestContext,
      token: string,
    ): Promise<boolean>;
    requestStatusAccess(
      context: import('@racepilot/core').RequestContext,
      eventSlug: string,
      email: string,
      locale: 'de' | 'en',
    ): Promise<void>;
    redeemStatusAccess(
      context: import('@racepilot/core').RequestContext,
      token: string,
    ): Promise<Array<{
      eventName: string;
      statusKey: string;
      label: string;
      color: string;
    }> | null>;
  };
  registrationRateLimiter?: {
    consume(ip: string, eventKey: string): Promise<boolean>;
  };
  canonicalBaseUrl?: string;
  eventConsents?: {
    get(
      context: import('@racepilot/core').RequestContext,
      eventId: string,
    ): Promise<Array<{
      key: string;
      version: string;
      language: 'de' | 'en';
      text: string;
      hash: string;
    }> | null>;
    update(
      context: import('@racepilot/core').RequestContext,
      eventId: string,
      terms: Array<{
        key: string;
        version: string;
        language: 'de' | 'en';
        text: string;
        hash: string;
      }>,
      actor: string,
    ): Promise<Array<{
      key: string;
      version: string;
      language: 'de' | 'en';
      text: string;
      hash: string;
    }> | null>;
  };
  authenticator?: Authenticator;
  memberships?: MembershipRepository;
  bootstrap?: MembershipBootstrap;
  oidcClient?: { issuerUrl: string; clientId: string; redirectUri: string };
  runtimeBootstrap?: {
    configurationVersion: string;
    branding?: {
      logoUrl?: string | null;
      primaryColor?: string;
      accentColor?: string;
      eventImageUrl?: string | null;
    };
    legalLinks?: { label: string; href: string }[];
    capabilities?: string[];
  };
  /** Optional event modules (ADR 0004): registry, activation store, entitlements, routes. */
  modules?: ModuleApiDeps;
  /** Server-owned context resolvers for multi-tenant assemblies. */
  contextResolvers?: {
    public(request: Request): Promise<RequestContext | null>;
    member(request: Request): Promise<RequestContext | null>;
  };
  /** One explicit route mount point for trusted, operator-owned code. */
  mountAdditionalRoutes?: (
    app: Hono,
    contexts: {
      public(request: Request): Promise<RequestContext | null>;
      member(request: Request): Promise<RequestContext | null>;
    },
  ) => void;
}
export function createInMemoryRegistrationRateLimiter(
  options: { limit?: number; windowMs?: number; now?: () => number } = {},
) {
  const limit = options.limit ?? 8;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let calls = 0;
  return {
    consume: async (ip: string, eventKey: string) => {
      const key = `${eventKey.slice(0, 180)}:${ip.slice(0, 120)}`;
      const cutoff = now() - windowMs;
      if (++calls % 128 === 0) {
        for (const [storedKey, times] of hits) {
          const fresh = times.filter((time) => time > cutoff);
          if (fresh.length) hits.set(storedKey, fresh);
          else hits.delete(storedKey);
        }
      }
      const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now());
      hits.set(key, recent);
      if (hits.size > 20_000) hits.delete(hits.keys().next().value!);
      return true;
    },
  };
}
export function createApp(deps: ApiDeps) {
  if (
    deps.config.deploymentMode === 'community' &&
    !deps.config.organizationId
  ) {
    throw new Error('Community mode requires a configured organization');
  }
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok' }));
  const mode = deps.config.deploymentMode;
  const communityOrganizationId =
    mode === 'community' ? deps.config.organizationId : undefined;
  const acceptContext = (context: RequestContext | null) => {
    if (!context || context.deploymentMode !== mode) return null;
    if (
      communityOrganizationId &&
      context.organizationId !== communityOrganizationId
    )
      return null;
    return context;
  };
  const resolvePublicContext = async (request: Request) => {
    if (deps.contextResolvers) {
      try {
        return acceptContext(await deps.contextResolvers.public(request));
      } catch {
        return null;
      }
    }
    if (!communityOrganizationId) return null;
    return createRequestContext({
      deploymentMode: mode,
      organizationId: organizationId(communityOrganizationId),
      permissions: new Set(),
      capabilities: new Set(),
      correlationId: crypto.randomUUID(),
    });
  };
  const resolveMemberContext = async (request: Request) => {
    if (deps.contextResolvers) {
      try {
        return acceptContext(await deps.contextResolvers.member(request));
      } catch {
        return null;
      }
    }
    if (!communityOrganizationId) return null;
    const identity =
      (await deps.authenticator?.authenticate(request).catch(() => null)) ??
      null;
    if (!identity) return null;
    const permissions =
      (await deps.memberships
        ?.resolvePermissions(
          identity,
          organizationId(communityOrganizationId),
          deps.bootstrap,
        )
        .catch(() => new Set<string>())) ?? new Set<string>();
    const capabilities = new Set(deps.runtimeBootstrap?.capabilities ?? []);
    capabilities.delete('payment.bank_transfer');
    if (deps.paymentRecipients) {
      try {
        const recipient = await deps.paymentRecipients.get(
          createRequestContext({
            deploymentMode: mode,
            organizationId: organizationId(communityOrganizationId),
            permissions,
            capabilities: new Set(),
            correlationId: crypto.randomUUID(),
          }),
        );
        if (recipient) {
          validatePaymentRecipient(recipient);
          capabilities.add('payment.bank_transfer');
        }
      } catch {
        /* capability fails closed */
      }
    }
    return createRequestContext({
      deploymentMode: mode,
      organizationId: organizationId(communityOrganizationId),
      subject: { issuer: identity.issuer, subject: identity.subject },
      permissions,
      capabilities,
      correlationId: crypto.randomUUID(),
    });
  };
  app.get('/runtime/bootstrap', async (c) => {
    try {
      const context = await resolvePublicContext(c.req.raw);
      if (!context) return c.json({ error: 'Runtime unavailable' }, 404);
      const organization = await deps.organizations.getById(context);
      if (!organization || organization.status !== 'active')
        return c.json({ error: 'Runtime unavailable' }, 404);
      const bankTransferAvailable = await (async () => {
        if (!deps.paymentRecipients) return false;
        try {
          const recipient = await deps.paymentRecipients.get(context);
          if (!recipient) return false;
          validatePaymentRecipient(recipient);
          return true;
        } catch {
          return false;
        }
      })();
      const capabilities = new Set([
        ...(deps.runtimeBootstrap?.capabilities ?? []),
        ...context.capabilities,
      ]);
      if (bankTransferAvailable) capabilities.add('payment.bank_transfer');
      else capabilities.delete('payment.bank_transfer');
      if (deps.modules) {
        // Module availability is computed here; clients cannot supply it.
        for (const key of await resolveOrganizationModuleCapabilities(
          context,
          deps.modules,
        ).catch(() => []))
          capabilities.add(key);
      }
      const result = RuntimeBootstrapResponse.parse({
        schemaVersion: 1,
        configurationVersion:
          deps.runtimeBootstrap?.configurationVersion ?? '1',
        deploymentMode: context.deploymentMode,
        organization: {
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
        },
        branding: {
          logoUrl: deps.runtimeBootstrap?.branding?.logoUrl ?? null,
          primaryColor:
            deps.runtimeBootstrap?.branding?.primaryColor ?? '#174ea6',
          accentColor:
            deps.runtimeBootstrap?.branding?.accentColor ?? '#8a5a00',
          contactEmail: organization.contactEmail,
          eventImageUrl: deps.runtimeBootstrap?.branding?.eventImageUrl ?? null,
        },
        locale: organization.locale,
        // The current event lifecycle contract has no authoritative "active" event selection.
        activeEvent: null,
        capabilities: [...capabilities],
        legalLinks: deps.runtimeBootstrap?.legalLinks ?? [],
      });
      c.header('Cache-Control', 'private, max-age=0, must-revalidate');
      c.header('Vary', 'Host');
      c.header('ETag', `W/"${result.configurationVersion}"`);
      return c.json(result);
    } catch {
      return c.json({ error: 'Runtime unavailable' }, 404);
    }
  });
  app.get('/auth/config', (c) => c.json({ oidc: deps.oidcClient ?? null }));
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
  app.get('/admin/events/:eventId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
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
  app.post(
    '/admin/events/:eventId/registration-groups/:groupId/confirmation',
    async (c) => {
      const context = await resolveMemberContext(c.req.raw);
      if (!context) return c.json({ error: 'Unauthorized' }, 401);
      if (!context.permissions.has('entry:read'))
        return c.json({ error: 'Forbidden' }, 403);
      const eventId = c.req.param('eventId');
      const groupId = c.req.param('groupId');
      if (
        !z.string().uuid().safeParse(eventId).success ||
        !z.string().uuid().safeParse(groupId).success
      )
        return c.json({ error: 'Not found' }, 404);
      if (!deps.entryConfirmations || !deps.artifactJobs || !deps.objectStorage)
        return c.json({ error: 'Not found' }, 404);
      const data = await deps.entryConfirmations.getByGroup(
        context,
        eventId,
        groupId,
      );
      if (!data) return c.json({ error: 'Not found' }, 404);
      const keyHeader = c.req.header('Idempotency-Key');
      if (!keyHeader || !/^[\x21-\x7e]{1,200}$/.test(keyHeader))
        return c.json({ error: 'Idempotency-Key required' }, 400);
      const idempotencyKey = `confirmation:${eventId}:${groupId}:${keyHeader}`;
      const job = await deps.artifactJobs.enqueue(context, {
        eventId,
        kind: 'confirmation_pdf',
        registrationGroupId: groupId,
        idempotencyKey,
      });
      c.header('Cache-Control', 'private, no-store');
      c.header('Location', `/admin/artifact-jobs/${job.id}`);
      return c.json({ jobId: job.id, status: job.status }, 202);
    },
  );
  app.get('/admin/events/:eventId/entries.csv', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Not found' }, 404);
    const event = await deps.events.getById(context, eventId);
    if (
      !event ||
      !deps.entryExports ||
      !deps.artifactJobs ||
      !deps.objectStorage
    )
      return c.json({ error: 'Not found' }, 404);
    const requested = c.req.query('fields')?.split(',') ?? [
      ...entryExportFields,
    ];
    if (
      requested.length === 0 ||
      requested.some(
        (field) =>
          !entryExportFields.includes(
            field as (typeof entryExportFields)[number],
          ),
      )
    )
      return c.json({ error: 'Invalid export fields' }, 400);
    const keyHeader = c.req.header('Idempotency-Key');
    if (!keyHeader || !/^[\x21-\x7e]{1,200}$/.test(keyHeader))
      return c.json({ error: 'Idempotency-Key required' }, 400);
    const requestKey = keyHeader;
    const job = await deps.artifactJobs.enqueue(context, {
      eventId,
      kind: 'entries_csv',
      fields: requested,
      idempotencyKey: `entries-csv:${eventId}:${requestKey}`,
    });
    c.header('Cache-Control', 'private, no-store');
    c.header('Location', `/admin/artifact-jobs/${job.id}`);
    return c.json({ jobId: job.id, status: job.status }, 202);
  });
  app.get('/admin/artifact-jobs/:jobId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const id = c.req.param('jobId');
    if (
      !z.string().uuid().safeParse(id).success ||
      !deps.artifactJobs ||
      !deps.objectStorage
    )
      return c.json({ error: 'Not found' }, 404);
    const job = await deps.artifactJobs.getById(context, id);
    if (!job) return c.json({ error: 'Not found' }, 404);
    c.header('Cache-Control', 'private, no-store');
    if (job.status !== 'ready')
      return c.json(
        { jobId: job.id, status: job.status, error: job.error },
        job.status === 'failed' ? 422 : 202,
      );
    if (!job.objectId || !job.sha256 || !job.contentType)
      return c.json({ error: 'Not found' }, 404);
    const stored = await deps.objectStorage.get(
      context.organizationId,
      job.objectId,
    );
    if (
      !stored ||
      stored.ref.organizationId !== context.organizationId ||
      stored.ref.sha256 !== job.sha256 ||
      stored.ref.contentType !== job.contentType
    )
      return c.json({ error: 'Not found' }, 404);
    c.header('Content-Type', job.contentType);
    c.header(
      'Content-Disposition',
      `attachment; filename="${job.kind === 'entries_csv' ? `entries-${job.eventId}.csv` : `entry-confirmation-${job.id}.pdf`}"`,
    );
    return c.body(new Blob([Buffer.from(stored.body)]));
  });
  app.get('/admin/events', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    return c.json(await deps.events.listByOrganization(context));
  });
  app.post('/admin/events', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
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
    const context = await resolveMemberContext(c.req.raw);
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
    const context = await resolveMemberContext(c.req.raw);
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
    const { eventId, classId, acceptanceStatus, verificationStatus, search } =
      parsed.data;
    const query: EntryListQuery = {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      sort: parsed.data.sort,
      direction: parsed.data.direction,
      ...(eventId ? { eventId } : {}),
      ...(classId ? { classId } : {}),
      ...(acceptanceStatus ? { acceptanceStatus } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
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
  app.get('/admin/events/:eventId/pricing', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.pricing) return c.json({ error: 'Not found' }, 404);
    return c.json(
      await deps.pricing.listByEvent(context, c.req.param('eventId')),
    );
  });
  app.put('/admin/events/:eventId/pricing/:classId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.pricing) return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({
        baseCents: z.number().int().nonnegative(),
        additionalEntryAdjustmentCents: z.number().int(),
        earlyBirdDeadline: z.string().datetime({ offset: true }).nullable(),
        earlyBirdDiscountCents: z.number().int().nonnegative(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json(
        await setClassPriceRule(
          context,
          c.req.param('eventId'),
          { ...parsed.data, classId: c.req.param('classId') },
          { pricing: deps.pricing },
        ),
      );
    } catch {
      return c.json({ error: 'Forbidden or invalid price rule' }, 403);
    }
  });
  app.get('/admin/organization/payment-recipient', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.paymentRecipients) return c.json({ error: 'Not found' }, 404);
    const recipient = await deps.paymentRecipients.get(context);
    return c.json({ recipient });
  });
  app.put('/admin/organization/payment-recipient', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:update'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.paymentRecipients) return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({
        accountName: z.string().trim().min(1).max(70),
        iban: z.string().min(15).max(34),
        bic: z.string().max(11).nullable().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json({
        recipient: await updatePaymentRecipient(
          context,
          {
            accountName: parsed.data.accountName,
            iban: parsed.data.iban,
            ...(parsed.data.bic !== undefined ? { bic: parsed.data.bic } : {}),
          },
          { recipients: deps.paymentRecipients },
        ),
      });
    } catch {
      return c.json({ error: 'Invalid payment recipient' }, 400);
    }
  });
  app.post('/admin/invoices/:invoiceId/payments', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('payment:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.payments) return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({
        amountCents: z.number().int().positive(),
        reason: z.string().trim().min(1).max(1000),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await recordInvoicePayment(
        context,
        c.req.param('invoiceId'),
        parsed.data.amountCents,
        context.subject
          ? `${context.subject.issuer}#${context.subject.subject}`
          : context.correlationId,
        parsed.data.reason,
        { payments: deps.payments },
      );
      return result ? c.json(result, 201) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid payment' }, 403);
    }
  });
  app.post('/admin/payments/:paymentId/corrections', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('payment:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.payments) return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({ reason: z.string().trim().min(1).max(1000) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await correctInvoicePayment(
        context,
        c.req.param('paymentId'),
        context.subject
          ? `${context.subject.issuer}#${context.subject.subject}`
          : context.correlationId,
        parsed.data.reason,
        { payments: deps.payments },
      );
      return result ? c.json(result, 201) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid correction' }, 403);
    }
  });
  app.get('/public/events/:organizationId/:slug', async (c) => {
    const orgId = c.req.param('organizationId');
    const context = await resolvePublicContext(c.req.raw);
    if (
      !context ||
      !z.string().uuid().safeParse(orgId).success ||
      orgId !== context.organizationId
    )
      return c.json({ error: 'Not found' }, 404);
    const event = await getPublicEvent(
      context,
      c.req.param('slug'),
      new Date(),
      { events: deps.events },
    );
    return event ? c.json(event) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/admin/events/:eventId/classes', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
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
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.classes) return c.json({ error: 'Not found' }, 404);
    return c.json(
      await deps.classes.listByEvent(context, c.req.param('eventId')),
    );
  });
  app.patch('/admin/events/:eventId/classes/:classId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
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
  app.get(
    '/public/organizations/:organizationId/events/:slug/registration/form',
    async (c) => {
      const orgId = c.req.param('organizationId');
      const context = await resolvePublicContext(c.req.raw);
      if (
        !context ||
        orgId !== context.organizationId ||
        !z.string().uuid().safeParse(orgId).success
      )
        return c.json({ error: 'Not found' }, 404);
      if (deps.publicRegistration) {
        const result = await deps.publicRegistration.getForm(
          context,
          c.req.param('slug'),
        );
        return result
          ? c.json({ form: standardRegistrationForm, ...(result as object) })
          : c.json({ error: 'Not found' }, 404);
      }
      const event = await getPublicEvent(
        context,
        c.req.param('slug'),
        new Date(),
        { events: deps.events },
      );
      return event
        ? c.json({ form: standardRegistrationForm, event, consents: [] })
        : c.json({ error: 'Not found' }, 404);
    },
  );
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
      // Forwarding headers are attacker-controlled unless a trusted proxy has
      // been explicitly configured. Use a shared bucket by default.
      const ip = 'unknown';
      if (
        deps.registrationRateLimiter &&
        !(await deps.registrationRateLimiter.consume(
          ip,
          `${orgId}:${eventSlug}`,
        ))
      )
        return c.json({ error: 'Registration unavailable' }, 429);
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
  app.post(
    '/public/organizations/:organizationId/events/:slug/registration/status-link',
    async (c) => {
      const orgId = c.req.param('organizationId');
      const context = await resolvePublicContext(c.req.raw);
      const generic = {
        message: 'If a verified contact matches, a status link will be sent.',
      };
      if (
        !context ||
        context.organizationId !== orgId ||
        !deps.publicRegistration
      )
        return c.json(generic, 202);
      const ip = 'unknown';
      const eventKey = `${orgId}:${c.req.param('slug')}:status`;
      if (
        deps.registrationRateLimiter &&
        !(await deps.registrationRateLimiter.consume(ip, eventKey))
      )
        return c.json(generic, 202);
      const body = await c.req.json().catch(() => null);
      const email = z.string().trim().email().max(320).safeParse(body?.email);
      const locale = z.enum(['de', 'en']).catch('de').parse(body?.locale);
      if (!email.success) return c.json(generic, 202);
      if (deps.registrationRateLimiter) {
        const emailKey = `${eventKey}:${createHash('sha256').update(email.data.toLowerCase()).digest('hex')}`;
        if (!(await deps.registrationRateLimiter.consume(ip, emailKey)))
          return c.json(generic, 202);
      }
      await deps.publicRegistration
        .requestStatusAccess(context, c.req.param('slug'), email.data, locale)
        .catch(() => undefined);
      return c.json(generic, 202);
    },
  );
  app.post('/public/registration/status/redeem', async (c) => {
    const generic = {
      error: 'This status link is invalid, expired, or already used.',
    };
    const context = await resolvePublicContext(c.req.raw);
    if (!context || !deps.publicRegistration) return c.json(generic, 200);
    if (
      deps.registrationRateLimiter &&
      !(await deps.registrationRateLimiter.consume(
        'unknown',
        `${context.organizationId}:status-redeem`,
      ))
    )
      return c.json(generic, 200);
    const body = await c.req.json().catch(() => null);
    const token = z.string().min(40).max(128).safeParse(body?.token);
    if (!token.success) return c.json(generic, 200);
    const statuses = await deps.publicRegistration
      .redeemStatusAccess(context, token.data)
      .catch(() => null);
    return statuses ? c.json({ statuses }, 200) : c.json(generic, 200);
  });
  app.post('/public/registration/verify', async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = z.string().min(1).max(512).safeParse(body?.token);
    if (!token.success || !deps.publicRegistration)
      return c.json({ verified: false }, 200);
    const context = await resolvePublicContext(c.req.raw);
    if (!context) return c.json({ verified: false }, 200);
    const verified = await deps.publicRegistration
      .verify(context, token.data)
      .catch(() => false);
    return c.json({ verified }, 200);
  });
  const consentTerm = z
    .object({
      key: z.string().trim().min(1).max(80),
      version: z.string().trim().min(1).max(40),
      language: z.enum(['de', 'en']),
      text: z.string().min(1).max(20000),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict();
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
        candidate as import('@racepilot/core').EntryWorkflow,
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
      candidate as import('@racepilot/core').EntryWorkflow,
      actor,
      body.reason,
    );
    return revision ? c.json(revision) : c.json({ error: 'Not found' }, 404);
  });
  app.get('/admin/organization/registration-settings', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.registrationSettings) return c.json({ error: 'Not found' }, 404);
    return c.json(
      RegistrationSettingsSchema.parse(
        await deps.registrationSettings.get(context),
      ),
    );
  });
  app.patch('/admin/organization/registration-settings', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:update'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.registrationSettings) return c.json({ error: 'Not found' }, 404);
    const parsed = RegistrationSettingsSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : 'unknown';
    return c.json(
      await deps.registrationSettings.update(context, parsed.data, actor),
    );
  });
  if (deps.modules)
    installModules(
      app,
      deps.modules,
      resolveMemberContext,
      resolvePublicContext,
    );
  deps.mountAdditionalRoutes?.(app, {
    public: resolvePublicContext,
    member: resolveMemberContext,
  });
  return app;
}
