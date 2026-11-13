import type { Hono } from 'hono';
import {
  createArtifactJobRepository,
  createEntryAdminActionsRepository,
  createEntryConfirmationRepository,
  createEntryDetailRepository,
  createEntryDocumentsRepository,
  createEntryExportRepository,
  createEntryRepository,
  createEntryStatusDimensionRepository,
  createEntryWorkflowRepository,
  createEventClassPricingRepository,
  createEventClassRepository,
  createEventConsentRepository,
  createEventRepository,
  createEventSetupRepository,
  createInvoicePaymentRepository,
  createMembershipRepository,
  createMessageRepository,
  createModuleActivationRepository,
  createOrganizationRepository,
  createOverviewRepository,
  createPaymentRecipientRepository,
  createPostgresRegistrationRateLimiter,
  createPublicRegistrationRateLimitSettingsRepository,
  createPublicRegistrationService,
  createRegistrationFormConfigRepository,
  createRegistrationSettingsRepository,
  createTimingRepository,
  type Database,
} from '@racepilot/adapter-postgres';
import {
  consoleLogger,
  createModuleRegistry,
  resolveCanonicalOrigin,
  type CanonicalOrigin,
  type Logger,
  type MembershipBootstrap,
  type ModuleEntitlements,
  type ObjectStorageProvider,
  type OrganizationMail,
  type TenantRef,
} from '@racepilot/core';
import { createApp } from './app.js';
import type { RegistrationRateLimiter } from './rate-limit.js';
import { timingModule } from './timing-module.js';
import { installTimingRoutes } from './timing.js';
import type { ApiDeps, Authenticator, ContextResolvers } from './types.js';

/** One fixed, server-configured organization; members authenticate through OIDC. */
export interface CommunityEdition {
  readonly deploymentMode: 'community';
  readonly organizationId: string;
  readonly authentication?: {
    readonly authenticator: Authenticator;
    readonly bootstrap: MembershipBootstrap;
  };
}

/** Many organizations; the assembly resolves the tenant for every request. */
export interface CloudEdition {
  readonly deploymentMode: 'cloud';
  readonly contexts: ContextResolvers;
}

export type ProductEdition = CommunityEdition | CloudEdition;

export interface ProductApiOptions {
  readonly db: Database;
  readonly edition: ProductEdition;
  readonly objectStorage?: ObjectStorageProvider;
  /**
   * Verified origin per organization. Public registration, verification mails and
   * resume links need it; an organization without an origin cannot use them.
   */
  readonly canonicalOrigin?: CanonicalOrigin;
  /**
   * Per-organization mail identity. Present when the deployment delivers mail; the
   * `mail.delivery` capability is resolved from it for each organization.
   */
  readonly mail?: OrganizationMail;
  /** Shared limiter for public registration; Community defaults to the Postgres one. */
  readonly registrationRateLimiter?: RegistrationRateLimiter;
  readonly logger?: Logger;
  readonly entitlements?: ModuleEntitlements;
  readonly oidcClient?: ApiDeps['oidcClient'];
  readonly rateLimits: Pick<
    ApiDeps['config'],
    | 'TRUSTED_PROXIES'
    | 'PUBLIC_REGISTRATION_ORG_LIMIT'
    | 'PUBLIC_REGISTRATION_EVENT_LIMIT'
    | 'PUBLIC_REGISTRATION_WINDOW_SECONDS'
  >;
}

function editionDeps(
  edition: ProductEdition,
): Pick<
  ApiDeps,
  'config' | 'contextResolvers' | 'authenticator' | 'bootstrap'
> {
  if (edition.deploymentMode === 'cloud')
    return {
      config: { deploymentMode: 'cloud' },
      contextResolvers: edition.contexts,
    };
  return {
    config: {
      deploymentMode: 'community',
      organizationId: edition.organizationId,
    },
    ...(edition.authentication ?? {}),
  };
}

async function mailDeliveryAvailable(
  tenant: TenantRef,
  mail: OrganizationMail | undefined,
  canonicalOrigin: CanonicalOrigin | undefined,
): Promise<boolean> {
  if (!mail || !canonicalOrigin) return false;
  const [configuration, origin] = await Promise.all([
    mail.configuration(tenant),
    resolveCanonicalOrigin(canonicalOrigin, tenant),
  ]);
  return configuration !== null && origin !== null;
}

/**
 * Builds the complete product API from the database and the edition's ports.
 * Community and Cloud assemblies share this composition; they differ only in the
 * options they pass (tenant resolution, storage, entitlements, rate limiting).
 */
export function createProductApi(options: ProductApiOptions): Hono {
  const { db, edition, objectStorage, canonicalOrigin, mail } = options;
  const edit = editionDeps(edition);
  const timingRepository = createTimingRepository(db);
  const publicRegistration =
    mail && canonicalOrigin
      ? {
          service: createPublicRegistrationService(db, { canonicalOrigin }),
          rateLimiter:
            options.registrationRateLimiter ??
            createPostgresRegistrationRateLimiter(db),
        }
      : undefined;
  return createApp({
    ...edit,
    config: { ...edit.config, ...options.rateLimits },
    logger: options.logger ?? consoleLogger,
    organizations: createOrganizationRepository(db),
    events: createEventRepository(db),
    eventSetup: createEventSetupRepository(db),
    entryExports: createEntryExportRepository(db),
    overview: createOverviewRepository(db),
    entryConfirmations: createEntryConfirmationRepository(db),
    artifactJobs: createArtifactJobRepository(db),
    ...(objectStorage ? { objectStorage } : {}),
    classes: createEventClassRepository(db),
    registrationSettings: createRegistrationSettingsRepository(db),
    registrationFormConfigs: createRegistrationFormConfigRepository(db),
    entryWorkflows: createEntryWorkflowRepository(db),
    entryStatusDimensions: createEntryStatusDimensionRepository(db),
    eventConsents: createEventConsentRepository(db),
    publicRegistrationRateLimits:
      createPublicRegistrationRateLimitSettingsRepository(db),
    ...(publicRegistration ? { publicRegistration } : {}),
    memberships: createMembershipRepository(db),
    payments: createInvoicePaymentRepository(db),
    entryDetails: createEntryDetailRepository(db),
    entryAdminActions: createEntryAdminActionsRepository(db),
    paymentRecipients: createPaymentRecipientRepository(db),
    pricing: createEventClassPricingRepository(db),
    entries: createEntryRepository(db),
    messages: createMessageRepository(db, objectStorage, canonicalOrigin),
    entryDocuments: createEntryDocumentsRepository(db),
    // Optional event modules are registered statically here (ADR 0004). Community
    // activates everything locally; Cloud supplies its entitlement port.
    modules: {
      registry: createModuleRegistry([timingModule]),
      activations: createModuleActivationRepository(db),
      ...(options.entitlements ? { entitlements: options.entitlements } : {}),
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
    },
    organizationCapabilities: async (tenant) =>
      (await mailDeliveryAvailable(tenant, mail, canonicalOrigin))
        ? ['mail.delivery']
        : [],
    ...(options.oidcClient ? { oidcClient: options.oidcClient } : {}),
  });
}
