import proxyaddr from 'proxy-addr';

export type RegistrationRateLimitScope = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RegistrationRateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export type OrganizationRateLimitOverrides = {
  organizationLimit?: number;
  eventLimit?: number;
  windowSeconds?: number;
};

export type EventRateLimitOverrides = {
  eventLimit?: number;
  windowSeconds?: number;
};

export function resolveRegistrationRateLimits(
  defaults: {
    organizationLimit: number;
    eventLimit: number;
    windowSeconds: number;
  },
  organization: OrganizationRateLimitOverrides | null | undefined,
  event: EventRateLimitOverrides | null | undefined,
) {
  const organizationWindow =
    organization?.windowSeconds ?? defaults.windowSeconds;
  return {
    organization: {
      limit: organization?.organizationLimit ?? defaults.organizationLimit,
      windowMs: organizationWindow * 1000,
    },
    event: {
      limit:
        event?.eventLimit ?? organization?.eventLimit ?? defaults.eventLimit,
      windowMs: (event?.windowSeconds ?? organizationWindow) * 1000,
    },
  };
}

export type RegistrationRateLimiter = {
  persistence?: 'process' | 'shared';
  consume(
    clientIdentity: string,
    scopes: readonly RegistrationRateLimitScope[],
  ): Promise<RegistrationRateLimitResult>;
};

export function compileTrustedProxyList(addresses: readonly string[]) {
  return proxyaddr.compile([...addresses]);
}

/** Resolve the client from the peer address, consulting X-Forwarded-For only
 * when the actual peer matches an explicitly trusted proxy. */
export function resolveClientIdentity(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  isTrustedProxy: ReturnType<typeof proxyaddr.compile>,
): string | null {
  if (!remoteAddress) return null;
  try {
    return (
      proxyaddr(
        {
          headers: { 'x-forwarded-for': forwardedFor },
          socket: { remoteAddress },
        } as unknown as Parameters<typeof proxyaddr>[0],
        isTrustedProxy,
      ) || remoteAddress
    );
  } catch {
    // Malformed forwarding data can never replace the trustworthy peer address.
    return remoteAddress;
  }
}

export function createInMemoryRegistrationRateLimiter(
  options: {
    limit?: number;
    windowMs?: number;
    now?: () => number;
  } = {},
): RegistrationRateLimiter {
  const defaultLimit = options.limit ?? 8;
  const defaultWindowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let calls = 0;
  return {
    persistence: 'process' as const,
    consume: async (clientIdentity, scopes) => {
      const currentTime = now();
      const checked = scopes.map((scope) => {
        const key = `${scope.key.slice(0, 180)}:${clientIdentity.slice(0, 120)}`;
        const windowMs = scope.windowMs || defaultWindowMs;
        const limit = scope.limit || defaultLimit;
        const recent = (hits.get(key) ?? []).filter(
          (time) => time > currentTime - windowMs,
        );
        return { key, recent, windowMs, limit };
      });
      const blocked = checked.filter(
        ({ recent, limit }) => recent.length >= limit,
      );
      if (blocked.length) {
        return {
          allowed: false,
          retryAfterMs: Math.max(
            ...blocked.map(({ recent, windowMs }) =>
              Math.max(1, recent[0]! + windowMs - currentTime),
            ),
          ),
        };
      }
      for (const { key, recent } of checked) {
        recent.push(currentTime);
        hits.set(key, recent);
      }
      if (++calls % 128 === 0) {
        for (const [key, times] of hits) {
          const lastUsed = times.at(-1) ?? 0;
          if (lastUsed < currentTime - 24 * 60 * 60_000) hits.delete(key);
        }
      }
      if (hits.size > 20_000) hits.delete(hits.keys().next().value!);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
