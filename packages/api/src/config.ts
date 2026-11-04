import { z } from 'zod';
import { mailConfigSchema, validateMailConfig } from '@racepilot/contracts';
import { compileTrustedProxyList } from './rate-limit.js';
import { parseDeploymentMode } from '@racepilot/core';
import { healthResponseSchema } from '@racepilot/contracts';

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
  TRUSTED_PROXIES: z.string().default(''),
  PUBLIC_REGISTRATION_ORG_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(100_000)
    .default(60),
  PUBLIC_REGISTRATION_EVENT_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(100_000)
    .default(8),
  PUBLIC_REGISTRATION_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(86_400)
    .default(60),
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
  const trustedProxyAddresses = parsed.data.TRUSTED_PROXIES.split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  try {
    compileTrustedProxyList(trustedProxyAddresses);
  } catch {
    throw new Error('Invalid configuration variables: TRUSTED_PROXIES');
  }
  return {
    ...parsed.data,
    TRUSTED_PROXIES: trustedProxyAddresses,
    ...mailConfig,
    mailEnabled:
      parsed.data.MAIL_PROVIDER === 'smtp' &&
      Boolean(parsed.data.CANONICAL_BASE_URL),
    storageEnabled: parsed.data.STORAGE_PROVIDER !== 'disabled',
    deploymentMode: parseDeploymentMode(parsed.data.DEPLOYMENT_MODE),
  };
}
