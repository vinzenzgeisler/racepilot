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
  createModuleRegistry,
  type MembershipBootstrap,
  type ModuleEntitlements,
  type ObjectStorageProvider,
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
  /** Enables public registration and verification links (transitional static origin). */
  readonly canonicalBaseUrl?: string;
  /** Whether the assembly delivers mail; combined with `canonicalBaseUrl`. */
  readonly mailEnabled: boolean;
  /** Capabilities that hold for the whole deployment (transitional). */
  readonly capabilities?: readonly string[];
  readonly registrationRateLimiter?: RegistrationRateLimiter;
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

/**
 * Builds the complete product API from the database and the edition's ports.
 * Community and Cloud assemblies share this composition; they differ only in the
 * options they pass (tenant resolution, storage, entitlements, rate limiting).
 */
export function createProductApi(options: ProductApiOptions): Hono {
  const { db, edition, objectStorage, canonicalBaseUrl } = options;
  const edit = editionDeps(edition);
  const timingRepository = createTimingRepository(db);
  const publicRegistration =
    options.mailEnabled && canonicalBaseUrl
      ? createPublicRegistrationService(db, { canonicalBaseUrl })
      : undefined;
  return createApp({
    ...edit,
    config: { ...edit.config, ...options.rateLimits },
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
    ...(publicRegistration
      ? {
          publicRegistration,
          registrationRateLimiter:
            options.registrationRateLimiter ??
            createPostgresRegistrationRateLimiter(db),
          publicRegistrationRateLimits:
            createPublicRegistrationRateLimitSettingsRepository(db),
        }
      : {}),
    ...(canonicalBaseUrl ? { canonicalBaseUrl } : {}),
    memberships: createMembershipRepository(db),
    payments: createInvoicePaymentRepository(db),
    entryDetails: createEntryDetailRepository(db),
    entryAdminActions: createEntryAdminActionsRepository(db),
    paymentRecipients: createPaymentRecipientRepository(db),
    pricing: createEventClassPricingRepository(db),
    entries: createEntryRepository(db),
    messages: createMessageRepository(db, objectStorage, canonicalBaseUrl),
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
      capabilities: [...(options.capabilities ?? [])],
    },
    ...(options.oidcClient ? { oidcClient: options.oidcClient } : {}),
  });
}
