import { eq } from 'drizzle-orm';
import {
  createArtifactJobRepository,
  createEntryConfirmationRepository,
  createEntryExportRepository,
  createMailOutboxRepository,
  createModuleActivationRepository,
  createOrganizationRepository,
  createPaymentRecipientRepository,
  organizations,
  type Database,
} from '@racepilot/adapter-postgres';
import {
  createModuleRegistry,
  type CanonicalOrigin,
  type MailProvider,
  type ModuleEntitlements,
  type ObjectStorageProvider,
} from '@racepilot/core';
import { createArtifactTask } from './artifacts.js';
import { composeWorkerTasks, type WorkerTaskHandler } from './index.js';
import { createMailOutboxTask } from './mail.js';
import { createModuleTasks } from './modules.js';

/** Jobs of the single server-configured organization only. */
export interface CommunityWorkerEdition {
  readonly deploymentMode: 'community';
  readonly organizationId: string;
}

/** Jobs of any active organization; the job envelope names the tenant. */
export interface CloudWorkerEdition {
  readonly deploymentMode: 'cloud';
}

export type ProductWorkerEdition = CommunityWorkerEdition | CloudWorkerEdition;

export interface ProductWorkerOptions {
  readonly db: Database;
  readonly edition: ProductWorkerEdition;
  /** Artifact (PDF, CSV) and message-attachment storage; without it those jobs are not registered. */
  readonly storage?: ObjectStorageProvider;
  /** Outbound mail; without it the mail outbox job is not registered. */
  readonly mail?: {
    readonly provider: MailProvider;
    /** Verified origin per organization; verification and resume links are bound to it. */
    readonly canonicalOrigin: CanonicalOrigin;
    readonly leaseMs: number;
  };
  readonly entitlements?: ModuleEntitlements;
  /** Called when a module job is dropped because its module is not active. */
  readonly onRejected?: (task: string, reason: string) => void;
}

export interface ProductWorker {
  readonly taskList: Record<string, WorkerTaskHandler>;
}

/**
 * Builds the complete product job set from the database and the edition's ports.
 * Every task rebuilds the tenant context from the job envelope and rejects
 * organizations that are unknown, disabled, or (in Community) not the configured one.
 */
export function createProductWorker(
  options: ProductWorkerOptions,
): ProductWorker {
  const { db, edition, storage, mail } = options;
  const tenant = {
    deploymentMode: edition.deploymentMode,
    ...(edition.deploymentMode === 'community'
      ? { communityOrganizationId: edition.organizationId }
      : {}),
    getOrganization: async (id: string) => {
      const [organization] = await db
        .select({ status: organizations.status })
        .from(organizations)
        .where(eq(organizations.id, id));
      return organization ?? null;
    },
  };
  // Module jobs are guarded per organization and event (ADR 0004). No modules ship jobs yet.
  const moduleTasks = createModuleTasks({
    ...tenant,
    modules: {
      registry: createModuleRegistry([]),
      activations: createModuleActivationRepository(db),
      ...(options.entitlements ? { entitlements: options.entitlements } : {}),
    },
    handlers: {},
    ...(options.onRejected ? { onRejected: options.onRejected } : {}),
  });
  const artifactTasks = storage
    ? {
        artifact_generate: createArtifactTask({
          ...tenant,
          jobs: createArtifactJobRepository(db),
          organizations: createOrganizationRepository(db),
          confirmations: createEntryConfirmationRepository(db),
          exports: createEntryExportRepository(db),
          storage,
          paymentRecipients: createPaymentRecipientRepository(db),
        }),
      }
    : {};
  const mailTasks = mail
    ? {
        mail_outbox: createMailOutboxTask({
          ...tenant,
          repository: createMailOutboxRepository(db, {
            leaseMs: mail.leaseMs,
          }),
          mail: mail.provider,
          canonicalOrigin: mail.canonicalOrigin,
          ...(storage ? { storage } : {}),
        }),
      }
    : {};
  return {
    taskList: composeWorkerTasks(moduleTasks, artifactTasks, mailTasks),
  };
}
