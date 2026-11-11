import { Hono } from 'hono';
import { registerEventsRoutes } from './routes/events.js';
import { registerPublicRegistrationRoutes } from './routes/public-registration.js';
import { registerEntriesRoutes } from './routes/entries.js';
import { registerPaymentsRoutes } from './routes/payments.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerOrganizationRoutes } from './routes/organization.js';
import { registerRegistrationRoutes } from './routes/registration.js';
import type { RequestContext } from '@racepilot/core';
import type { ApiDeps } from './types.js';
export { health, deploymentModeFromConfig, loadConfig } from './config.js';
export type { ApiDeps, Authenticator } from './types.js';

import { installModules } from './modules.js';
import { resolveOrganizationModuleCapabilities } from '@racepilot/core';

export * from './modules.js';

import {
  compileTrustedProxyList,
  resolveClientIdentity,
  type RegistrationRateLimitScope,
  type RegistrationRateLimitResult,
} from './rate-limit.js';
export { createInMemoryRegistrationRateLimiter } from './rate-limit.js';
import {
  createRequestContext,
  organizationId,
  validatePaymentRecipient,
} from '@racepilot/core';
import { RuntimeBootstrapResponse } from '@racepilot/contracts';

export function createApp(deps: ApiDeps) {
  if (deps.publicRegistration && !deps.registrationRateLimiter)
    throw new Error('Public registration requires a configured rate limiter');
  if (deps.publicRegistration && !deps.publicRegistrationRateLimits)
    throw new Error(
      'Public registration requires configured tenant rate-limit settings',
    );
  if (
    deps.config.deploymentMode === 'cloud' &&
    deps.publicRegistration &&
    deps.registrationRateLimiter?.persistence !== 'shared'
  )
    throw new Error(
      'Cloud public registration requires shared persistent rate-limit storage',
    );
  if (
    deps.config.deploymentMode === 'community' &&
    !deps.config.organizationId
  ) {
    throw new Error('Community mode requires a configured organization');
  }
  const app = new Hono();
  const trustedProxyMatcher = compileTrustedProxyList(
    deps.config.TRUSTED_PROXIES ?? [],
  );
  const rateLimitDefaults = {
    organizationLimit: deps.config.PUBLIC_REGISTRATION_ORG_LIMIT ?? 60,
    eventLimit: deps.config.PUBLIC_REGISTRATION_EVENT_LIMIT ?? 8,
    windowSeconds: deps.config.PUBLIC_REGISTRATION_WINDOW_SECONDS ?? 60,
  };
  const clientIdentityFor = (context: {
    env: unknown;
    req: { header(name: string): string | undefined };
  }) => {
    const env = (context.env ?? {}) as {
      incoming?: { socket?: { remoteAddress?: string } };
    };
    const incoming = env.incoming;
    return resolveClientIdentity(
      incoming?.socket?.remoteAddress,
      context.req.header('x-forwarded-for'),
      trustedProxyMatcher,
    );
  };
  const consumeRegistrationBudget = async (
    context: Parameters<typeof clientIdentityFor>[0],
    scopes: readonly RegistrationRateLimitScope[],
  ): Promise<RegistrationRateLimitResult & { unavailable?: boolean }> => {
    if (!deps.registrationRateLimiter)
      return { allowed: true, retryAfterMs: 0 };
    try {
      const clientIdentity = clientIdentityFor(context);
      if (!clientIdentity)
        return { allowed: false, retryAfterMs: 0, unavailable: true };
      return await deps.registrationRateLimiter.consume(clientIdentity, scopes);
    } catch {
      return { allowed: false, retryAfterMs: 0, unavailable: true };
    }
  };
  const setRetryAfter = (
    context: { header(name: string, value: string): void },
    retryAfterMs: number,
  ) => {
    if (retryAfterMs > 0)
      context.header(
        'Retry-After',
        String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
      );
  };
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
  const routeContext = {
    app,
    deps,
    resolvePublicContext,
    resolveMemberContext,
    consumeRegistrationBudget,
    setRetryAfter,
    rateLimitDefaults,
    mode,
    communityOrganizationId,
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
  registerOrganizationRoutes(routeContext);

  registerEventsRoutes(routeContext);
  registerEntriesRoutes(routeContext);
  registerMessageRoutes(routeContext);

  registerPaymentsRoutes(routeContext);

  registerPublicRegistrationRoutes(routeContext);
  registerRegistrationRoutes(routeContext);

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
