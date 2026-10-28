import {
  createRequestContext,
  resolveEventModuleAccess,
  type DeploymentMode,
  type JobContext,
  type ModuleDeps,
} from '@racepilot/core';
import { ModuleJobPayload } from '@racepilot/contracts';
import { createJobContext, parseJobEnvelope } from './index.js';
import type { WorkerTaskHandler } from './index.js';

export interface ModuleJobHandlerInput {
  context: JobContext;
  eventId: string;
  moduleId: string;
  config: unknown;
  data: unknown;
}
export interface ModuleTasksOptions {
  modules: ModuleDeps;
  /** Handlers keyed by the task names declared in module manifests. */
  handlers: Readonly<
    Record<string, (input: ModuleJobHandlerInput) => Promise<void>>
  >;
  deploymentMode: DeploymentMode;
  communityOrganizationId?: string;
  getOrganization(id: string): Promise<{ status: string } | null>;
  /** Called when a job is dropped because its module is not active for the event. */
  onRejected?: (task: string, reason: string) => void;
}

/**
 * Builds worker tasks for module jobs. Every run re-checks the server-side module
 * state for the job's organization and event; jobs of inactive modules are
 * rejected without executing the handler and without retry.
 */
export function createModuleTasks(
  options: ModuleTasksOptions,
): Record<string, WorkerTaskHandler> {
  const owner = new Map<string, string>();
  for (const definition of options.modules.registry.list())
    for (const job of definition.manifest.jobs)
      owner.set(job, definition.manifest.id);
  for (const name of Object.keys(options.handlers))
    if (!owner.has(name))
      throw new Error(`Handler ${name} is not declared by any module manifest`);
  for (const name of owner.keys())
    if (!options.handlers[name])
      throw new Error(`Job ${name} is declared without a handler`);
  const tasks: Record<string, WorkerTaskHandler> = {};
  for (const [name, handler] of Object.entries(options.handlers)) {
    const moduleId = owner.get(name)!;
    tasks[name] = async (payload, helpers) => {
      const envelope = parseJobEnvelope(payload);
      const context = await createJobContext(envelope, {
        deploymentMode: options.deploymentMode,
        ...(options.communityOrganizationId
          ? { communityOrganizationId: options.communityOrganizationId }
          : {}),
        getOrganization: options.getOrganization,
        jobId: helpers.job.id,
      });
      const body = ModuleJobPayload.parse(envelope.payload);
      const access = await resolveEventModuleAccess(
        createRequestContext({
          deploymentMode: context.deploymentMode,
          organizationId: context.organizationId,
          permissions: new Set(),
          capabilities: new Set(),
          correlationId: context.correlationId,
        }),
        options.modules,
        body.eventId,
        moduleId,
      );
      if (!access || access.access !== 'active') {
        options.onRejected?.(name, 'module inactive');
        return;
      }
      await handler({
        context,
        eventId: body.eventId,
        moduleId,
        config: access.config,
        data: body.data,
      });
    };
  }
  return tasks;
}
