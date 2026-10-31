import { serve } from '@hono/node-server';
import { loadConfig } from './index.js';
import {
  createDatabase,
  migrate,
  ensureCommunityOrganization,
  createOrganizationRepository,
  createEventRepository,
  createEventClassRepository,
  createRegistrationSettingsRepository,
  createRegistrationFormConfigRepository,
  createEntryWorkflowRepository,
  createEntryStatusDimensionRepository,
  createEventConsentRepository,
  createPublicRegistrationService,
  createEntryConfirmationRepository,
  createArtifactJobRepository,
  createEntryExportRepository,
  createMembershipRepository,
  createInvoicePaymentRepository,
  createPaymentRecipientRepository,
  createEventClassPricingRepository,
  createEntryRepository,
  getOrganizationMailConfiguration,
  createModuleActivationRepository,
  createTimingRepository,
  createPostgresRegistrationRateLimiter,
  createPublicRegistrationRateLimitSettingsRepository,
} from '@racepilot/adapter-postgres';
import { createModuleRegistry } from '@racepilot/core';
import { timingModule } from './timing-module.js';
import { installTimingRoutes } from './timing.js';
import { createApp } from './index.js';
import { createOIDCIdentityProvider } from '@racepilot/adapter-oidc';
import { createLocalObjectStorage } from '@racepilot/adapter-local-storage';
import { createS3ObjectStorage } from '@racepilot/adapter-s3';
const config = loadConfig(process.env);
await migrate(config.DATABASE_URL);
const { db } = await createDatabase(config.DATABASE_URL);
const timingRepository = createTimingRepository(db);
const org = await ensureCommunityOrganization(db, {
  slug: config.COMMUNITY_ORGANIZATION_SLUG,
  name: config.COMMUNITY_ORGANIZATION_NAME,
  timezone: config.COMMUNITY_ORGANIZATION_TIMEZONE,
  locale: config.COMMUNITY_ORGANIZATION_LOCALE,
});
const organizationMail = config.mailEnabled
  ? await getOrganizationMailConfiguration(db, org.id)
  : null;
const canonicalBaseUrl = config.CANONICAL_BASE_URL;
const publicRegistration =
  config.mailEnabled && canonicalBaseUrl
    ? createPublicRegistrationService(db, { canonicalBaseUrl })
    : undefined;
const storage =
  config.STORAGE_PROVIDER === 'local'
    ? createLocalObjectStorage(config.STORAGE_LOCAL_ROOT!)
    : config.STORAGE_PROVIDER === 's3'
      ? createS3ObjectStorage({
          bucket: config.STORAGE_S3_BUCKET!,
          ...(config.STORAGE_S3_REGION
            ? { region: config.STORAGE_S3_REGION }
            : {}),
          ...(config.STORAGE_S3_ENDPOINT
            ? { endpoint: config.STORAGE_S3_ENDPOINT }
            : {}),
          ...(config.STORAGE_S3_ACCESS_KEY_ID &&
          config.STORAGE_S3_SECRET_ACCESS_KEY
            ? {
                credentials: {
                  accessKeyId: config.STORAGE_S3_ACCESS_KEY_ID,
                  secretAccessKey: config.STORAGE_S3_SECRET_ACCESS_KEY,
                },
              }
            : {}),
        })
      : undefined;
const identityProvider =
  config.OIDC_PROVIDER === 'oidc'
    ? await createOIDCIdentityProvider({
        issuerUrl: config.OIDC_ISSUER_URL!,
        audience: config.OIDC_AUDIENCE!,
      })
    : undefined;
serve({
  fetch: createApp({
    config: {
      deploymentMode: 'community',
      organizationId: org.id,
      TRUSTED_PROXIES: config.TRUSTED_PROXIES,
      PUBLIC_REGISTRATION_ORG_LIMIT: config.PUBLIC_REGISTRATION_ORG_LIMIT,
      PUBLIC_REGISTRATION_EVENT_LIMIT: config.PUBLIC_REGISTRATION_EVENT_LIMIT,
      PUBLIC_REGISTRATION_WINDOW_SECONDS:
        config.PUBLIC_REGISTRATION_WINDOW_SECONDS,
    },
    organizations: createOrganizationRepository(db),
    events: createEventRepository(db),
    entryExports: createEntryExportRepository(db),
    entryConfirmations: createEntryConfirmationRepository(db),
    artifactJobs: createArtifactJobRepository(db),
    ...(storage ? { objectStorage: storage } : {}),
    classes: createEventClassRepository(db),
    registrationSettings: createRegistrationSettingsRepository(db),
    registrationFormConfigs: createRegistrationFormConfigRepository(db),
    entryWorkflows: createEntryWorkflowRepository(db),
    entryStatusDimensions: createEntryStatusDimensionRepository(db),
    eventConsents: createEventConsentRepository(db),
    ...(publicRegistration
      ? {
          publicRegistration,
          registrationRateLimiter: createPostgresRegistrationRateLimiter(db),
          publicRegistrationRateLimits:
            createPublicRegistrationRateLimitSettingsRepository(db),
        }
      : {}),
    ...(config.CANONICAL_BASE_URL
      ? { canonicalBaseUrl: config.CANONICAL_BASE_URL }
      : {}),
    memberships: createMembershipRepository(db),
    payments: createInvoicePaymentRepository(db),
    paymentRecipients: createPaymentRecipientRepository(db),
    pricing: createEventClassPricingRepository(db),
    entries: createEntryRepository(db),
    // Optional event modules are registered statically here (ADR 0004); Community
    // activates everything locally, so no entitlement port is supplied.
    modules: {
      registry: createModuleRegistry([timingModule]),
      activations: createModuleActivationRepository(db),
      routes: {
        timing: (router) => installTimingRoutes(router, timingRepository),
      },
      publicReads: {
        timing: (context, eventId) =>
          timingRepository.latestPublished(context, eventId),
      },
    },
    runtimeBootstrap: {
      configurationVersion: '1',
      capabilities: organizationMail ? ['mail.delivery'] : [],
    },
    ...(identityProvider
      ? {
          oidcClient: {
            issuerUrl: new URL(config.OIDC_ISSUER_URL!).href,
            clientId: config.OIDC_CLIENT_ID!,
            redirectUri: config.OIDC_REDIRECT_URI!,
          },
        }
      : {}),
    ...(identityProvider
      ? {
          authenticator: {
            authenticate: async (request: Request) => {
              if (!request.headers.get('authorization')?.startsWith('Bearer '))
                return null;
              try {
                return await identityProvider.verify(
                  request.headers.get('authorization')!.slice(7),
                );
              } catch {
                return null;
              }
            },
          },
          bootstrap: {
            issuer: new URL(config.OIDC_ISSUER_URL!).href,
            ...(config.OIDC_BOOTSTRAP_SUBJECT
              ? { subject: config.OIDC_BOOTSTRAP_SUBJECT }
              : {}),
            ...(config.OIDC_BOOTSTRAP_EMAIL
              ? { email: config.OIDC_BOOTSTRAP_EMAIL }
              : {}),
          },
        }
      : {}),
  }).fetch,
  port: config.PORT,
  hostname: '127.0.0.1',
});
