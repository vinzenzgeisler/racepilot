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
    getOrganization(id: string): Promise<{ status: string } | null>;
    jobId: string;
  },
): Promise<JobContext> {
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
