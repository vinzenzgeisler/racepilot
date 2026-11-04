import {
  need,
  organizationViews,
  eventViews,
  ModuleChange,
} from './modules-queries.js';
import { entitled, isObject, stable, toMap } from './modules-access.js';
import {
  ModuleActivationRepository,
  ModuleDeps,
  ModuleView,
} from './modules-access.js';
import { ModuleError } from './modules-registry.js';
import {
  ModuleScope,
  ModuleSnapshot,
  ModuleStateRecord,
  ModuleWrite,
} from './modules-access.js';
import { RequestContext } from './context.js';

async function change(
  ctx: RequestContext,
  deps: ModuleDeps,
  scope: ModuleScope,
  moduleId: string,
  input: ModuleChange,
  actor: string,
): Promise<ModuleStateRecord | null> {
  const definition = deps.registry.get(moduleId);
  if (!definition) throw new ModuleError('not_found', 'Unknown module');
  if (input.enabled === undefined && input.config === undefined)
    throw new ModuleError('invalid_config', 'Nothing to change');
  const isEntitled = await entitled(deps, ctx, moduleId);
  const decide = (snapshot: ModuleSnapshot): ModuleWrite | null => {
    const rows =
      scope.level === 'event' ? snapshot.event! : snapshot.organization;
    const current = rows.get(moduleId);
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== (current?.version ?? 0)
    )
      throw new ModuleError('conflict', 'Module state changed concurrently');
    const enabled = input.enabled ?? current?.enabled ?? false;
    // New event activations start from the organization template, then module defaults.
    const seed =
      current?.config ??
      (scope.level === 'event'
        ? snapshot.organization.get(moduleId)?.config
        : undefined) ??
      definition.defaultConfig;
    // Disabling keeps stored configuration untouched, even if it predates a schema change.
    const parsed =
      !enabled && input.config === undefined && current
        ? ({ success: true, data: current.config } as const)
        : definition.configSchema.safeParse(
            input.config === undefined ? seed : input.config,
          );
    if (parsed.success && !isObject(parsed.data))
      throw new ModuleError(
        'invalid_config',
        'Configuration must be an object',
      );
    if (!parsed.success)
      throw new ModuleError(
        'invalid_config',
        'Configuration does not satisfy the module schema',
        parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );
    if (enabled) {
      if (!isEntitled)
        throw new ModuleError('not_entitled', 'Module is not included');
      if (
        scope.level === 'event' &&
        snapshot.organization.get(moduleId)?.enabled !== true
      )
        throw new ModuleError(
          'conflict',
          'Module is not enabled for the organization',
        );
      for (const dependency of definition.manifest.dependencies)
        if (rows.get(dependency.id)?.enabled !== true)
          throw new ModuleError('conflict', `Requires module ${dependency.id}`);
    } else {
      for (const other of deps.registry.list())
        if (
          other.manifest.dependencies.some((d) => d.id === moduleId) &&
          rows.get(other.manifest.id)?.enabled === true
        )
          throw new ModuleError(
            'conflict',
            `Required by active module ${other.manifest.id}`,
          );
    }
    if (
      current &&
      current.enabled === enabled &&
      stable(current.config) === stable(parsed.data) &&
      current.moduleVersion === definition.manifest.version
    )
      return null; // idempotent repeat
    return {
      enabled,
      config: parsed.data,
      moduleVersion: definition.manifest.version,
      actor,
      action:
        current?.enabled !== enabled
          ? enabled
            ? 'enable'
            : 'disable'
          : 'configure',
      reason: input.reason,
    };
  };
  const result = await deps.activations.apply(ctx, scope, moduleId, decide);
  if (result) return result;
  // null = foreign event, or an idempotent repeat that wrote nothing
  if (scope.level === 'event') {
    const rows = await deps.activations.listEvent(ctx, scope.eventId);
    return rows?.event.find((r) => r.moduleId === moduleId) ?? null;
  }
  return (
    (await deps.activations.listOrganization(ctx)).find(
      (r) => r.moduleId === moduleId,
    ) ?? null
  );
}

/** Returns the resulting view, or null when the event is not owned by the organization. */
export async function setOrganizationModule(
  ctx: RequestContext,
  deps: ModuleDeps,
  moduleId: string,
  input: ModuleChange,
  actor: string,
): Promise<ModuleView | null> {
  need(ctx, 'organization:update');
  await change(ctx, deps, { level: 'organization' }, moduleId, input, actor);
  return (
    (await organizationViews(ctx, deps)).find((m) => m.id === moduleId) ?? null
  );
}

export async function setEventModule(
  ctx: RequestContext,
  deps: ModuleDeps,
  eventId: string,
  moduleId: string,
  input: ModuleChange,
  actor: string,
): Promise<ModuleView | null> {
  need(ctx, 'event:write');
  const saved = await change(
    ctx,
    deps,
    { level: 'event', eventId },
    moduleId,
    input,
    actor,
  );
  if (!saved) return null;
  return (
    (await eventViews(ctx, deps, eventId))?.find((m) => m.id === moduleId) ??
    null
  );
}

/**
 * Reference implementation of the repository contract, used by tests and by
 * assemblies without persistence. Writes are serialized per call stack.
 */
export function createInMemoryModuleActivationRepository(
  ownsEvent: (ctx: RequestContext, eventId: string) => boolean = () => true,
) {
  const organization = new Map<string, ModuleStateRecord>();
  const event = new Map<string, ModuleStateRecord>();
  const audit: Array<ModuleWrite & { key: string; version: number }> = [];
  const key = (...parts: string[]) => parts.join('|');
  const forOrganization = (ctx: RequestContext) =>
    [...organization.entries()]
      .filter(([k]) => k.startsWith(`${ctx.organizationId}|`))
      .map(([, v]) => v);
  const forEvent = (ctx: RequestContext, eventId: string) =>
    [...event.entries()]
      .filter(([k]) => k.startsWith(`${ctx.organizationId}|${eventId}|`))
      .map(([, v]) => v);
  const repository: ModuleActivationRepository = {
    listOrganization: async (ctx) => forOrganization(ctx),
    listEvent: async (ctx, eventId) =>
      ownsEvent(ctx, eventId)
        ? {
            organization: forOrganization(ctx),
            event: forEvent(ctx, eventId),
          }
        : null,
    apply: async (ctx, scope, moduleId, decide) => {
      if (scope.level === 'event' && !ownsEvent(ctx, scope.eventId))
        return null;
      const store = scope.level === 'event' ? event : organization;
      const storeKey =
        scope.level === 'event'
          ? key(ctx.organizationId, scope.eventId, moduleId)
          : key(ctx.organizationId, moduleId);
      const write = decide({
        organization: toMap(forOrganization(ctx)),
        ...(scope.level === 'event'
          ? { event: toMap(forEvent(ctx, scope.eventId)) }
          : {}),
      });
      if (!write) return null;
      const version = (store.get(storeKey)?.version ?? 0) + 1;
      const record: ModuleStateRecord = {
        moduleId,
        enabled: write.enabled,
        config: write.config,
        version,
        moduleVersion: write.moduleVersion,
        updatedAt: new Date(),
        updatedBy: write.actor,
      };
      store.set(storeKey, record);
      audit.push({ ...write, key: storeKey, version });
      return record;
    },
  };
  return Object.assign(repository, { audit });
}
