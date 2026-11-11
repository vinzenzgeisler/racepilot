import { Hono } from 'hono';
import { RequestContext, DeploymentMode } from '@racepilot/core';
import { type ModuleApiDeps } from './modules.js';
import { type RegistrationRateLimiter } from './rate-limit.js';
import {
  type EventClassRepository,
  type EventClassPricingRepository,
  type PaymentRecipientRepository,
  type InvoicePaymentRepository,
  type EntryRepository,
  type EntryDetailRepository,
  type EntryWorkflowRepository,
  type EntryStatusDimensionRepository,
  type EntryExportRepository,
  type EntryConfirmationRepository,
  type ArtifactJobRepository,
  type ObjectStorageProvider,
  type OrganizationRepository,
  type EventRepository,
  type MembershipRepository,
  type MembershipBootstrap,
  type ExternalIdentity,
  type MessageCampaignCreate,
  type MessageCampaignSendResult,
  type MessageCampaignData,
  type MessagePreviewResult,
  type MessageRecipientFilter,
  type MessageTemplate,
} from '@racepilot/core';
import { type RegistrationSettings } from '@racepilot/contracts';

export interface Authenticator {
  authenticate(request: Request): Promise<ExternalIdentity | null>;
}

export interface ApiDeps {
  config: {
    deploymentMode: DeploymentMode;
    organizationId?: string;
    TRUSTED_PROXIES?: readonly string[];
    PUBLIC_REGISTRATION_ORG_LIMIT?: number;
    PUBLIC_REGISTRATION_EVENT_LIMIT?: number;
    PUBLIC_REGISTRATION_WINDOW_SECONDS?: number;
  };
  organizations: OrganizationRepository;
  events: EventRepository;
  classes?: EventClassRepository;
  entries?: EntryRepository;
  messages?: {
    preview(
      context: RequestContext,
      eventId: string,
      filter: MessageRecipientFilter,
    ): Promise<
      MessagePreviewResult<{
        count: number;
        recipients: Array<{
          entryId: string | null;
          email: string;
          name: string;
        }>;
      }>
    >;
    send(
      context: RequestContext,
      eventId: string,
      idempotencyKey: string,
      input: MessageCampaignCreate,
      actor: string,
    ): Promise<MessageCampaignSendResult<MessageCampaignData>>;
    retryFailed(
      context: RequestContext,
      campaignId: string,
    ): Promise<unknown | null>;
    list(context: RequestContext, eventId: string): Promise<unknown[] | null>;
    listTemplates(
      context: RequestContext,
      eventId: string,
    ): Promise<unknown[] | null>;
    saveTemplate(
      context: RequestContext,
      input: MessageTemplate,
    ): Promise<unknown | null>;
    previewTemplate(
      context: RequestContext,
      eventId: string,
      filter: MessageRecipientFilter,
      subject: string,
      text: string,
    ): Promise<MessagePreviewResult<unknown>>;
    quickAction(
      context: RequestContext,
      eventId: string,
      action: 'resend-verification' | 'remind-open-payments',
      actor: string,
    ): Promise<MessageCampaignSendResult<MessageCampaignData>>;
  };
  entryDetails?: EntryDetailRepository;
  entryExports?: EntryExportRepository;
  entryConfirmations?: EntryConfirmationRepository;
  artifactJobs?: ArtifactJobRepository;
  objectStorage?: ObjectStorageProvider;
  payments?: InvoicePaymentRepository;
  paymentRecipients?: PaymentRecipientRepository;
  pricing?: EventClassPricingRepository;
  entryWorkflows?: EntryWorkflowRepository;
  entryStatusDimensions?: EntryStatusDimensionRepository;
  registrationSettings?: {
    get(
      context: import('@racepilot/core').RequestContext,
    ): Promise<RegistrationSettings>;
    update(
      context: import('@racepilot/core').RequestContext,
      settings: RegistrationSettings,
      actor: string,
    ): Promise<RegistrationSettings>;
  };
  publicRegistration?: {
    registerCustomFieldUpload?(
      context: RequestContext,
      eventSlug: string,
      fieldKey: string,
      objectId: string,
      uploadTokenHash: string,
    ): Promise<boolean>;
    canDownloadCustomFieldUpload?(
      context: RequestContext,
      eventId: string,
      objectId: string,
    ): Promise<boolean>;
    checkRequestedStartNumber?(
      context: RequestContext,
      eventSlug: string,
      number: string,
    ): Promise<{ available: boolean } | null>;
    getForm(
      context: import('@racepilot/core').RequestContext,
      eventSlug: string,
    ): Promise<unknown | null>;
    submit(
      context: import('@racepilot/core').RequestContext,
      eventSlug: string,
      payload: import('@racepilot/contracts').PublicRegistrationRequest,
    ): Promise<unknown>;
    verify(
      context: import('@racepilot/core').RequestContext,
      token: string,
    ): Promise<boolean>;
    saveDraft?(
      context: RequestContext,
      eventSlug: string,
      email: string,
      language: 'de' | 'en',
      draft: Record<string, unknown>,
    ): Promise<{ sent: true }>;
    resumeDraft?(
      context: RequestContext,
      token: string,
    ): Promise<unknown | null>;
  };
  registrationFormConfigs?: {
    getOrganization(context: RequestContext): Promise<unknown | null>;
    updateOrganization(
      context: RequestContext,
      config: Record<string, unknown>,
      actor: string,
    ): Promise<unknown | null>;
    getEvent(context: RequestContext, eventId: string): Promise<unknown | null>;
    updateEvent(
      context: RequestContext,
      eventId: string,
      config: Record<string, unknown>,
      actor: string,
    ): Promise<unknown | null>;
  };
  registrationRateLimiter?: RegistrationRateLimiter;
  publicRegistrationRateLimits?: {
    getOrganization(context: RequestContext): Promise<{
      organizationLimit?: number;
      eventLimit?: number;
      windowSeconds?: number;
    } | null>;
    updateOrganization(
      context: RequestContext,
      settings: {
        organizationLimit?: number | undefined;
        eventLimit?: number | undefined;
        windowSeconds?: number | undefined;
      },
      actor: string,
    ): Promise<{
      organizationLimit?: number;
      eventLimit?: number;
      windowSeconds?: number;
    } | null>;
    getEvent(
      context: RequestContext,
      eventId: string,
    ): Promise<{
      eventLimit?: number;
      windowSeconds?: number;
    } | null>;
    updateEvent(
      context: RequestContext,
      eventId: string,
      settings: {
        eventLimit?: number | undefined;
        windowSeconds?: number | undefined;
      },
      actor: string,
    ): Promise<{ eventLimit?: number; windowSeconds?: number } | null>;
    resolvePublicEvent(
      context: RequestContext,
      slug: string,
    ): Promise<{
      eventId: string;
      organization: {
        organizationLimit?: number;
        eventLimit?: number;
        windowSeconds?: number;
      } | null;
      event: { eventLimit?: number; windowSeconds?: number } | null;
    } | null>;
  };
  canonicalBaseUrl?: string;
  eventConsents?: {
    get(
      context: import('@racepilot/core').RequestContext,
      eventId: string,
    ): Promise<Array<{
      key: string;
      version: string;
      language: 'de' | 'en';
      text: string;
      hash: string;
    }> | null>;
    update(
      context: import('@racepilot/core').RequestContext,
      eventId: string,
      terms: Array<{
        key: string;
        version: string;
        language: 'de' | 'en';
        text: string;
        hash: string;
      }>,
      actor: string,
    ): Promise<Array<{
      key: string;
      version: string;
      language: 'de' | 'en';
      text: string;
      hash: string;
    }> | null>;
  };
  authenticator?: Authenticator;
  memberships?: MembershipRepository;
  bootstrap?: MembershipBootstrap;
  oidcClient?: { issuerUrl: string; clientId: string; redirectUri: string };
  runtimeBootstrap?: {
    configurationVersion: string;
    branding?: {
      logoUrl?: string | null;
      primaryColor?: string;
      accentColor?: string;
      eventImageUrl?: string | null;
    };
    legalLinks?: { label: string; href: string }[];
    capabilities?: string[];
  };
  /** Optional event modules (ADR 0004): registry, activation store, entitlements, routes. */
  modules?: ModuleApiDeps;
  /** Server-owned context resolvers for multi-tenant assemblies. */
  contextResolvers?: {
    public(request: Request): Promise<RequestContext | null>;
    member(request: Request): Promise<RequestContext | null>;
  };
  /** One explicit route mount point for trusted, operator-owned code. */
  mountAdditionalRoutes?: (
    app: Hono,
    contexts: {
      public(request: Request): Promise<RequestContext | null>;
      member(request: Request): Promise<RequestContext | null>;
    },
  ) => void;
}
