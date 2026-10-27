import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  ProviderError,
  type ExternalIdentity,
  type IdentityProvider,
} from '@racepilot/core';

const algorithms = ['RS256', 'ES256'] as const;
const maxClockSkewSeconds = 60;

export interface OIDCConfig {
  issuerUrl: string;
  audience: string;
}

function normalizedIssuer(value: string): string {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error();
  return url.href;
}

export async function createOIDCIdentityProvider(
  config: OIDCConfig,
): Promise<IdentityProvider> {
  let issuer: string;
  try {
    issuer = normalizedIssuer(config.issuerUrl);
    if (!config.audience.trim()) throw new Error();
  } catch {
    throw new ProviderError('invalid_input', 'Invalid OIDC configuration');
  }

  const discoveryUrl = new URL(
    '.well-known/openid-configuration',
    issuer.endsWith('/') ? issuer : `${issuer}/`,
  ).href;
  let metadata: { issuer?: unknown; jwks_uri?: unknown };
  try {
    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error();
    metadata = (await response.json()) as typeof metadata;
    if (metadata.issuer !== issuer || typeof metadata.jwks_uri !== 'string')
      throw new Error();
    const jwksUrl = new URL(metadata.jwks_uri);
    if (jwksUrl.protocol !== 'https:' && issuer.startsWith('https:'))
      throw new Error();
  } catch {
    throw new ProviderError('unavailable', 'OIDC discovery failed');
  }

  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri as string), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });
  let forcedRefreshAt = 0;

  return {
    async verify(credential: string): Promise<ExternalIdentity> {
      if (!credential || credential.length > 32_768)
        throw new ProviderError('unauthorized', 'Invalid credential');
      try {
        const { payload } = await jwtVerify(credential, jwks, {
          issuer,
          audience: config.audience,
          algorithms: [...algorithms],
          clockTolerance: maxClockSkewSeconds,
        });
        validateIssuedAt(payload);
        return identityFrom(payload, issuer);
      } catch (firstError) {
        // jose caches JWKS but does not refresh for a newly rotated kid until its
        // cooldown expires. Force one discovery-authorized JWKS refresh and retry.
        const kid = unverifiedKid(credential);
        if (kid && Date.now() - forcedRefreshAt >= 30_000) {
          try {
            forcedRefreshAt = Date.now();
            await jwks.reload();
            const { payload } = await jwtVerify(credential, jwks, {
              issuer,
              audience: config.audience,
              algorithms: [...algorithms],
              clockTolerance: maxClockSkewSeconds,
            });
            validateIssuedAt(payload);
            return identityFrom(payload, issuer);
          } catch {
            // Keep the public error stable and never expose token/provider data.
          }
        }
        void firstError;
        throw new ProviderError(
          'unauthorized',
          'Credential verification failed',
        );
      }
    },
  };
}

function validateIssuedAt(payload: JWTPayload): void {
  const now = Math.floor(Date.now() / 1000);
  if (
    typeof payload.iat !== 'number' ||
    payload.iat > now + maxClockSkewSeconds ||
    typeof payload.exp !== 'number'
  )
    throw new Error('Invalid issued-at claim');
}

function identityFrom(payload: JWTPayload, issuer: string): ExternalIdentity {
  if (typeof payload.sub !== 'string' || !payload.sub)
    throw new Error('Missing subject');
  return {
    issuer,
    subject: payload.sub,
    ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    ...(typeof payload.email_verified === 'boolean'
      ? { emailVerified: payload.email_verified }
      : {}),
    ...(typeof payload.name === 'string' ? { displayName: payload.name } : {}),
  };
}

function unverifiedKid(token: string): string | null {
  try {
    const header = JSON.parse(
      Buffer.from(token.split('.')[0]!, 'base64url').toString(),
    ) as { kid?: unknown; alg?: unknown };
    return typeof header.kid === 'string' && header.alg !== 'none'
      ? header.kid
      : null;
  } catch {
    return null;
  }
}
