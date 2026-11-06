export { createEntryRepository } from './entry-repository.js';
export {
  migrate,
  withOrganizationTransaction,
  createDatabase,
} from './database-service.js';
export { createEventConsentRepository } from './event-consent.js';
export { createPublicRegistrationService } from './public-registration-service.js';
export { createEntryConfirmationRepository } from './entry-confirmation.js';
export { ensureCommunityOrganization } from './organization.js';
export { emailTemplateVersions } from './mail-schema.js';
export { emailOutbox } from './mail-schema.js';
export { emailDeliveries } from './mail-schema.js';
export { createOrganizationRepository } from './organization.js';
export { createEventRepository } from './events.js';
export { createEventClassRepository } from './events.js';
export { createMembershipRepository } from './memberships.js';
export { createPersonRepository } from './people.js';
export { createVehicleRepository } from './people.js';
export { createEntryExportRepository } from './entry-repositories.js';
export { createInvoicePaymentRepository } from './billing-payments.js';
export { createPaymentRecipientRepository } from './billing-payments.js';
export { createEventClassPricingRepository } from './billing-invoices.js';
export { createInvoiceRepository } from './billing-invoices.js';
export type { MailOutboxExecutor } from './mail-outbox.js';
export type { NewMailOutboxMessage } from './mail-outbox.js';
export { enqueueMailOutbox } from './mail-outbox.js';
export { setOrganizationMailConfiguration } from './mail-templates.js';
export { getOrganizationMailConfiguration } from './mail-templates.js';
export { saveMailTemplateVersion } from './mail-templates.js';
export { createMailOutboxRepository } from './mail-outbox.js';
export type { RegistrationSettings } from './registration-settings.js';
export { createRegistrationSettingsRepository } from './registration-settings.js';
export { createRegistrationFormConfigRepository } from './registration-settings.js';
export type { PublicRegistrationPayload } from './registration-settings.js';
export { createEntryWorkflowRepository } from './entry-workflow.js';
export { createEntryStatusDimensionRepository } from './entry-status-dimensions.js';
export type { TimingMeasurementInput } from './timing-types.js';
export type { TimingMeasurementRecord } from './timing-types.js';
export type { TimingRepository } from './timing-types.js';
export type { TimingResultVersion } from './timing-types.js';
export { createTimingRepository } from './timing-repository.js';
export * from './schema/organization.js';
export * from './schema/entries.js';
export * from './schema/status.js';
export * from './schema/billing.js';
export * from './schema/public-registration.js';
export * from './schema/forms.js';
export * from './schema/modules.js';

export { createModuleActivationRepository } from './module-activation.js';

export { artifactJobs, createArtifactJobRepository } from './artifact-jobs.js';

export type { Database } from './database.js';
export { createPostgresRegistrationRateLimiter } from './registration-rate-limits.js';
export { createPublicRegistrationRateLimitSettingsRepository } from './registration-rate-limit-settings.js';

/** Drizzle's database and transaction objects both satisfy this executor. */

/** Call with the caller's Drizzle transaction to atomically enqueue with domain writes. */

/** Tenant-scoped immutable workflow revisions with organization defaults and event overrides. */

/** Event-scoped status dimensions and audited per-entry status markers. */
export { createEntryDetailRepository } from './entry-detail.js';
