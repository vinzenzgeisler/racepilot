import { evaluate, toMap } from './modules-access.js';
import { ModuleAvailability } from './modules-access.js';
import { ModuleDefinition } from './modules-registry.js';
import { ModuleDeps } from './modules-access.js';
import { ModuleStateRecord } from './modules-access.js';
import { ModuleView } from './modules-access.js';
import { RequestContext } from './context.js';

export const view = (
  definition: ModuleDefinition,
  record: ModuleStateRecord | undefined,
  availability: ModuleAvailability,
  organizationEnabled?: boolean,
): ModuleView => ({
  id: definition.manifest.id,
  version: definition.manifest.version,
  displayName: definition.manifest.displayName,
  description: definition.manifest.description ?? '',
  gallery: definition.manifest.gallery,
  dependencies: definition.manifest.dependencies.map((d) => ({ ...d })),
  enabled: record?.enabled ?? false,
  entitled: availability.entitled,
  configValid: availability.configValid,
  available: availability.available,
  status: availability.available
    ? record?.enabled
      ? 'active'
      : 'available'
    : 'unavailable',
  unavailableReason: availability.available
    ? null
    : !availability.entitled
      ? 'entitlement'
      : !availability.dependencyAvailable
        ? 'dependency'
        : 'edition',
  ...(organizationEnabled === undefined ? {} : { organizationEnabled }),
  config: record?.config ?? definition.defaultConfig,
  stateVersion: record?.version ?? null,
  updatedAt: record?.updatedAt.toISOString() ?? null,
  updatedBy: record?.updatedBy ?? null,
});

export const need = (ctx: RequestContext, permission: string) => {
  if (!ctx.permissions.has(permission)) throw new Error('Forbidden');
};

export async function organizationViews(
  ctx: RequestContext,
  deps: ModuleDeps,
): Promise<ModuleView[]> {
  const rows = toMap(await deps.activations.listOrganization(ctx));
  const availability = await evaluate(deps, ctx, rows);
  return deps.registry
    .list()
    .map((d) =>
      view(d, rows.get(d.manifest.id), availability.get(d.manifest.id)!),
    );
}

export async function eventViews(
  ctx: RequestContext,
  deps: ModuleDeps,
  eventId: string,
): Promise<ModuleView[] | null> {
  const rows = await deps.activations.listEvent(ctx, eventId);
  if (!rows) return null;
  const organizationRows = toMap(rows.organization);
  const eventRows = toMap(rows.event);
  const organization = await evaluate(deps, ctx, organizationRows);
  const event = await evaluate(deps, ctx, eventRows, organization);
  return deps.registry
    .list()
    .map((d) =>
      view(
        d,
        eventRows.get(d.manifest.id),
        event.get(d.manifest.id)!,
        organizationRows.get(d.manifest.id)?.enabled === true,
      ),
    );
}

export async function listOrganizationModules(
  ctx: RequestContext,
  deps: ModuleDeps,
): Promise<ModuleView[]> {
  need(ctx, 'organization:read');
  return organizationViews(ctx, deps);
}

export async function listEventModules(
  ctx: RequestContext,
  deps: ModuleDeps,
  eventId: string,
): Promise<ModuleView[] | null> {
  need(ctx, 'event:read');
  return eventViews(ctx, deps, eventId);
}

export interface ModuleChange {
  enabled?: boolean | undefined;
  config?: unknown;
  expectedVersion?: number | undefined;
  reason?: string | undefined;
}
