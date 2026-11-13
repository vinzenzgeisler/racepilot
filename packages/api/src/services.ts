import type {
  EventConsentTerm,
  MessageCampaignCreate,
  MessageCampaignData,
  MessageCampaignSendResult,
  MessagePreviewResult,
  MessageRecipientFilter,
  MessageTemplate,
  RequestContext,
} from '@racepilot/core';
import type {
  PublicRegistrationRequest,
  RegistrationSettings,
} from '@racepilot/contracts';

/** Message campaigns, templates, and quick actions of the admin UI. */
export interface MessageService {
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
}

export interface RegistrationSettingsService {
  get(context: RequestContext): Promise<RegistrationSettings>;
  update(
    context: RequestContext,
    settings: RegistrationSettings,
    actor: string,
  ): Promise<RegistrationSettings>;
}

export interface PublicRegistrationService {
  registerCustomFieldUpload(
    context: RequestContext,
    eventSlug: string,
    fieldKey: string,
    objectId: string,
    uploadTokenHash: string,
  ): Promise<boolean>;
  canDownloadCustomFieldUpload(
    context: RequestContext,
    eventId: string,
    objectId: string,
  ): Promise<boolean>;
  checkRequestedStartNumber(
    context: RequestContext,
    eventSlug: string,
    number: string,
  ): Promise<{ available: boolean } | null>;
  getForm(context: RequestContext, eventSlug: string): Promise<unknown | null>;
  submit(
    context: RequestContext,
    eventSlug: string,
    payload: PublicRegistrationRequest,
  ): Promise<unknown>;
  verify(context: RequestContext, token: string): Promise<boolean>;
  saveDraft(
    context: RequestContext,
    eventSlug: string,
    email: string,
    language: 'de' | 'en',
    draft: Record<string, unknown>,
  ): Promise<{ sent: true }>;
  resumeDraft(context: RequestContext, token: string): Promise<unknown | null>;
}

export interface RegistrationFormConfigService {
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
}

export interface RegistrationRateLimitSettings {
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
}

export interface EventConsentService {
  get(
    context: RequestContext,
    eventId: string,
  ): Promise<EventConsentTerm[] | null>;
  update(
    context: RequestContext,
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
}
