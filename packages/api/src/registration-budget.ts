import {
  compileTrustedProxyList,
  resolveClientIdentity,
  type RegistrationRateLimiter,
  type RegistrationRateLimitResult,
  type RegistrationRateLimitScope,
} from './rate-limit.js';
import type { ApiDeps } from './types.js';
import type { PublicRegistrationRouteDeps } from './routes/context.js';
import type { PublicRegistrationService } from './services.js';

type RequestLike = {
  env: unknown;
  req: { header(name: string): string | undefined };
};

/** Binds the registration service to its rate limiter and the configured proxy trust. */
export function createPublicRegistrationRouteDeps(
  config: ApiDeps['config'],
  service: PublicRegistrationService,
  rateLimiter: RegistrationRateLimiter,
): PublicRegistrationRouteDeps {
  const trustedProxies = compileTrustedProxyList(config.TRUSTED_PROXIES ?? []);
  const clientIdentityFor = (context: RequestLike) => {
    const env = (context.env ?? {}) as {
      incoming?: { socket?: { remoteAddress?: string } };
    };
    return resolveClientIdentity(
      env.incoming?.socket?.remoteAddress,
      context.req.header('x-forwarded-for'),
      trustedProxies,
    );
  };
  return {
    service,
    rateLimitDefaults: {
      organizationLimit: config.PUBLIC_REGISTRATION_ORG_LIMIT ?? 60,
      eventLimit: config.PUBLIC_REGISTRATION_EVENT_LIMIT ?? 8,
      windowSeconds: config.PUBLIC_REGISTRATION_WINDOW_SECONDS ?? 60,
    },
    consumeRegistrationBudget: async (
      context: RequestLike,
      scopes: readonly RegistrationRateLimitScope[],
    ): Promise<RegistrationRateLimitResult & { unavailable?: boolean }> => {
      try {
        const clientIdentity = clientIdentityFor(context);
        if (!clientIdentity)
          return { allowed: false, retryAfterMs: 0, unavailable: true };
        return await rateLimiter.consume(clientIdentity, scopes);
      } catch {
        return { allowed: false, retryAfterMs: 0, unavailable: true };
      }
    },
    setRetryAfter: (context, retryAfterMs) => {
      if (retryAfterMs > 0)
        context.header(
          'Retry-After',
          String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
        );
    },
  };
}
