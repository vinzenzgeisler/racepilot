import { createOIDCIdentityProvider } from '@racepilot/adapter-oidc';
import { createLocalObjectStorage } from '@racepilot/adapter-local-storage';
import { createS3ObjectStorage } from '@racepilot/adapter-s3';
import type {
  IdentityProvider,
  MembershipBootstrap,
  ObjectStorageProvider,
} from '@racepilot/core';
import type { loadConfig } from './config.js';
import type { Authenticator } from './types.js';

type CommunityConfig = ReturnType<typeof loadConfig>;

/** Builds the operator-selected object storage; `disabled` yields no storage. */
export function createCommunityObjectStorage(
  config: CommunityConfig,
): ObjectStorageProvider | undefined {
  if (config.STORAGE_PROVIDER === 'local') {
    if (!config.STORAGE_LOCAL_ROOT)
      throw new Error('STORAGE_LOCAL_ROOT is required');
    return createLocalObjectStorage(config.STORAGE_LOCAL_ROOT);
  }
  if (config.STORAGE_PROVIDER === 's3') {
    if (!config.STORAGE_S3_BUCKET)
      throw new Error('STORAGE_S3_BUCKET is required');
    return createS3ObjectStorage({
      bucket: config.STORAGE_S3_BUCKET,
      ...(config.STORAGE_S3_REGION ? { region: config.STORAGE_S3_REGION } : {}),
      ...(config.STORAGE_S3_ENDPOINT
        ? { endpoint: config.STORAGE_S3_ENDPOINT }
        : {}),
      ...(config.STORAGE_S3_ACCESS_KEY_ID && config.STORAGE_S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: config.STORAGE_S3_ACCESS_KEY_ID,
              secretAccessKey: config.STORAGE_S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return undefined;
}

/** Wraps a verified-bearer identity provider as the API authenticator port. */
export function createBearerAuthenticator(
  identityProvider: IdentityProvider,
): Authenticator {
  return {
    authenticate: async (request) => {
      const header = request.headers.get('authorization');
      if (!header?.startsWith('Bearer ')) return null;
      try {
        return await identityProvider.verify(header.slice(7));
      } catch {
        return null;
      }
    },
  };
}

export interface CommunityIdentity {
  authenticator: Authenticator;
  bootstrap: MembershipBootstrap;
  oidcClient: { issuerUrl: string; clientId: string; redirectUri: string };
}

/** Reads the Community OIDC settings; `disabled` yields no identity. */
export async function createCommunityIdentity(
  config: CommunityConfig,
): Promise<CommunityIdentity | undefined> {
  if (config.OIDC_PROVIDER !== 'oidc') return undefined;
  const { OIDC_ISSUER_URL, OIDC_AUDIENCE, OIDC_CLIENT_ID, OIDC_REDIRECT_URI } =
    config;
  if (
    !OIDC_ISSUER_URL ||
    !OIDC_AUDIENCE ||
    !OIDC_CLIENT_ID ||
    !OIDC_REDIRECT_URI
  )
    throw new Error('OIDC configuration is incomplete');
  const issuer = new URL(OIDC_ISSUER_URL).href;
  const identityProvider = await createOIDCIdentityProvider({
    issuerUrl: OIDC_ISSUER_URL,
    audience: OIDC_AUDIENCE,
  });
  return {
    authenticator: createBearerAuthenticator(identityProvider),
    bootstrap: {
      issuer,
      ...(config.OIDC_BOOTSTRAP_SUBJECT
        ? { subject: config.OIDC_BOOTSTRAP_SUBJECT }
        : {}),
      ...(config.OIDC_BOOTSTRAP_EMAIL
        ? { email: config.OIDC_BOOTSTRAP_EMAIL }
        : {}),
    },
    oidcClient: {
      issuerUrl: issuer,
      clientId: OIDC_CLIENT_ID,
      redirectUri: OIDC_REDIRECT_URI,
    },
  };
}
