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
export type WorkerTaskHandler = (
  payload: unknown,
  helpers: {
    job: { id: string; attempts?: number; max_attempts?: number };
  },
) => Promise<void>;

/** Merge trusted assembly task maps without allowing a module to replace a core task. */
export function composeWorkerTasks(
  ...taskGroups: ReadonlyArray<Readonly<Record<string, WorkerTaskHandler>>>
): Record<string, WorkerTaskHandler> {
  const composed: Record<string, WorkerTaskHandler> = {};
  for (const group of taskGroups) {
    for (const [name, handler] of Object.entries(group)) {
      if (!/^[a-z][a-z0-9_.-]{0,119}$/.test(name))
        throw new Error(`Invalid worker task name: ${name}`);
      if (Object.hasOwn(composed, name))
        throw new Error(`Worker task already registered: ${name}`);
      composed[name] = handler;
    }
  }
  return composed;
}
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
export { createModuleTasks } from './modules.js';
export type { ModuleTasksOptions, ModuleJobHandlerInput } from './modules.js';
