import {
  parseDeploymentMode,
  createJobContext as makeContext,
  organizationId,
  type DeploymentMode,
  type JobContext,
} from '@racepilot/core';
import {
  JobEnvelope,
  healthResponseSchema,
  type HealthResponse,
} from '@racepilot/contracts';
export function processHealthCheck(version: string): HealthResponse {
  return healthResponseSchema.parse({ status: 'ok', version });
}
export function deploymentModeFromConfig(configured: string): DeploymentMode {
  return parseDeploymentMode(configured);
}
export function parseJobEnvelope(input: unknown) {
  return JobEnvelope.parse(input);
}
export async function createJobContext(
  envelope: ReturnType<typeof parseJobEnvelope>,
  deps: {
    deploymentMode: DeploymentMode;
    communityOrganizationId?: string;
    getOrganization(id: string): Promise<{ status: string } | null>;
    jobId: string;
  },
): Promise<JobContext> {
  if (
    deps.deploymentMode === 'community' &&
    (!deps.communityOrganizationId ||
      envelope.organizationId !== deps.communityOrganizationId)
  )
    throw new Error('Organization unavailable');
  const org = await deps.getOrganization(envelope.organizationId);
  if (!org || org.status !== 'active')
    throw new Error('Organization unavailable');
  return makeContext({
    deploymentMode: deps.deploymentMode,
    organizationId: organizationId(envelope.organizationId),
    jobId: deps.jobId,
    correlationId: envelope.correlationId,
  });
}
export {
  processMailOutboxJob,
  renderMailTemplate,
  defaultMailTemplate,
  createMailOutboxTask,
} from './mail.js';
export type {
  MailOutboxRepository,
  MailOutboxRecord,
  MailTemplate,
  MailTemplateKey,
  MailLocale,
} from './mail.js';
export { createEntryConfirmationPdf } from './documents.js';
export type { EntryConfirmationData } from './documents.js';
