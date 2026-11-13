import type { Hono } from 'hono';
import type {
  DeploymentMode,
  ExternalIdentity,
  Logger,
  MembershipBootstrap,
  MembershipRepository,
  ObjectStorageProvider,
  RequestContext,
  TenantRef,
  AdminEntryRepository,
  ArtifactJobRepository,
  EntryAdminActionsRepository,
  EntryConfirmationRepository,
  EntryDetailRepository,
  EntryDocumentsRepository,
  EntryExportRepository,
  EntryStatusDimensionRepository,
  EntryWorkflowRepository,
  EventClassPricingRepository,
  EventClassRepository,
  EventRepository,
  EventSetupRepository,
  InvoicePaymentRepository,
  OrganizationRepository,
  OverviewRepository,
  PaymentRecipientRepository,
} from '@racepilot/core';
import type { ModuleApiDeps } from './modules.js';
import type { RegistrationRateLimiter } from './rate-limit.js';
import type {
  EventConsentService,
  MessageService,
  PublicRegistrationService,
  RegistrationFormConfigService,
  RegistrationRateLimitSettings,
  RegistrationSettingsService,
} from './services.js';

export interface Authenticator {
  authenticate(request: Request): Promise<ExternalIdentity | null>;
}

export interface ContextResolvers {
  public(request: Request): Promise<RequestContext | null>;
  member(request: Request): Promise<RequestContext | null>;
}

/**
 * Dependencies every installation has. They are created from the database, so a
 * missing one is a wiring error that fails at startup, never an HTTP 404.
 */
export interface CoreApiDeps {
  config: {
    deploymentMode: DeploymentMode;
    organizationId?: string;
    TRUSTED_PROXIES?: readonly string[];
    PUBLIC_REGISTRATION_ORG_LIMIT?: number;
    PUBLIC_REGISTRATION_EVENT_LIMIT?: number;
    PUBLIC_REGISTRATION_WINDOW_SECONDS?: number;
  };
  logger: Logger;
  organizations: OrganizationRepository;
  events: EventRepository;
  eventSetup: EventSetupRepository;
  classes: EventClassRepository;
  pricing: EventClassPricingRepository;
  eventConsents: EventConsentService;
  entries: AdminEntryRepository;
  entryDetails: EntryDetailRepository;
  entryAdminActions: EntryAdminActionsRepository;
  entryWorkflows: EntryWorkflowRepository;
  entryStatusDimensions: EntryStatusDimensionRepository;
  entryExports: EntryExportRepository;
  entryConfirmations: EntryConfirmationRepository;
  entryDocuments: EntryDocumentsRepository;
  artifactJobs: ArtifactJobRepository;
  overview: OverviewRepository;
  payments: InvoicePaymentRepository;
  paymentRecipients: PaymentRecipientRepository;
  messages: MessageService;
  registrationSettings: RegistrationSettingsService;
  registrationFormConfigs: RegistrationFormConfigService;
  publicRegistrationRateLimits: RegistrationRateLimitSettings;
}

/** Public registration needs mail and a canonical origin; both come as one unit. */
export interface PublicRegistrationModule {
  service: PublicRegistrationService;
  rateLimiter: RegistrationRateLimiter;
}

export interface RuntimeBootstrapConfig {
  configurationVersion: string;
  branding?: {
    logoUrl?: string | null;
    primaryColor?: string;
    accentColor?: string;
    eventImageUrl?: string | null;
  };
  legalLinks?: { label: string; href: string }[];
  capabilities?: string[];
}

/**
 * Inputs that depend on the edition or the operator's configuration. Routes that
 * need one of them are registered only when it is present.
 */
export interface EditionApiDeps {
  /** Documents, exports, uploads, and message attachments need object storage. */
  objectStorage?: ObjectStorageProvider;
  publicRegistration?: PublicRegistrationModule;
  authenticator?: Authenticator;
  memberships?: MembershipRepository;
  bootstrap?: MembershipBootstrap;
  oidcClient?: { issuerUrl: string; clientId: string; redirectUri: string };
  runtimeBootstrap?: RuntimeBootstrapConfig;
  /**
   * Capabilities that depend on the organization (for example `mail.delivery`).
   * Resolved per request for the runtime bootstrap, never once at startup.
   */
  organizationCapabilities?: (tenant: TenantRef) => Promise<readonly string[]>;
  /** Optional event modules (ADR 0004): registry, activation store, entitlements, routes. */
  modules?: ModuleApiDeps;
  /** Server-owned context resolvers for multi-tenant assemblies. */
  contextResolvers?: ContextResolvers;
  /** One explicit route mount point for trusted, operator-owned code. */
  mountAdditionalRoutes?: (app: Hono, contexts: ContextResolvers) => void;
}

export type ApiDeps = CoreApiDeps & EditionApiDeps;
