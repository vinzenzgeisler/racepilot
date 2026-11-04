import { moduleCapabilityKey } from './modules-registry.js';
import { ModuleDefinition } from './modules-registry.js';
import { ModuleManifest } from './modules-registry.js';
import { ModuleRegistry } from './modules-registry.js';
import { RequestContext } from './context.js';

export interface ModuleStateRecord {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly config: unknown;
  /** Monotonic counter for optimistic concurrency and audit. */
  readonly version: number;
  /** Manifest version the configuration was written against. */
  readonly moduleVersion: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export type ModuleScope =
  | { readonly level: 'organization' }
  | { readonly level: 'event'; readonly eventId: string };

export interface ModuleWrite {
  readonly enabled: boolean;
  readonly config: unknown;
  readonly moduleVersion: string;
  readonly actor: string;
  readonly action: 'enable' | 'disable' | 'configure';
  readonly reason?: string | undefined;
}

export interface ModuleSnapshot {
  readonly organization: ReadonlyMap<string, ModuleStateRecord>;
  /** Present for event scope only. */
  readonly event?: ReadonlyMap<string, ModuleStateRecord>;
}

export interface ModuleActivationRepository {
  /** Organization-wide template/availability rows; always tenant-scoped by `ctx`. */
  listOrganization(ctx: RequestContext): Promise<ModuleStateRecord[]>;
  /** Returns null when the event does not belong to the context organization. */
  listEvent(
    ctx: RequestContext,
    eventId: string,
  ): Promise<{
    organization: ModuleStateRecord[];
    event: ModuleStateRecord[];
  } | null>;
  /**
   * Serializes writers for the scope, hands `decide` the current snapshot and
   * persists its result with an audit record in one transaction. Returns null when
   * the event is not owned by the context organization; `decide` may throw.
   */
  apply(
    ctx: RequestContext,
    scope: ModuleScope,
    moduleId: string,
    decide: (snapshot: ModuleSnapshot) => ModuleWrite | null,
  ): Promise<ModuleStateRecord | null>;
}

/** Cloud binds modules to plans here; Community uses {@link allowAllModuleEntitlements}. */
export interface ModuleEntitlements {
  isEntitled(ctx: RequestContext, moduleId: string): Promise<boolean>;
}

export const allowAllModuleEntitlements: ModuleEntitlements = {
  isEntitled: async () => true,
};

export interface ModuleDeps {
  registry: ModuleRegistry;
  activations: ModuleActivationRepository;
  entitlements?: ModuleEntitlements | undefined;
}

export const isObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1,
          ),
        )
      : v,
  );

export const entitled = async (
  deps: ModuleDeps,
  ctx: RequestContext,
  id: string,
) => {
  try {
    return await (deps.entitlements ?? allowAllModuleEntitlements).isEntitled(
      ctx,
      id,
    );
  } catch {
    return false; // fail closed
  }
};

const configValid = (
  definition: ModuleDefinition,
  record?: ModuleStateRecord,
) =>
  record === undefined ||
  definition.configSchema.safeParse(record.config).success;

export interface ModuleAvailability {
  readonly entitled: boolean;
  readonly configValid: boolean;
  /** Enabled, entitled, valid, with all dependencies available in the same scope. */
  readonly available: boolean;
  readonly dependencyAvailable: boolean;
}

export async function evaluate(
  deps: ModuleDeps,
  ctx: RequestContext,
  rows: ReadonlyMap<string, ModuleStateRecord>,
  gate?: ReadonlyMap<string, ModuleAvailability>,
) {
  const result = new Map<string, ModuleAvailability>();
  for (const definition of deps.registry.list()) {
    const id = definition.manifest.id;
    const record = rows.get(id);
    const isEntitled = await entitled(deps, ctx, id);
    const valid = configValid(definition, record);
    const dependenciesOk = definition.manifest.dependencies.every(
      (dependency) => result.get(dependency.id)?.available === true,
    );
    result.set(id, {
      entitled: isEntitled,
      configValid: valid,
      dependencyAvailable: dependenciesOk,
      available:
        record?.enabled === true &&
        isEntitled &&
        valid &&
        dependenciesOk &&
        (gate === undefined || gate.get(id)?.available === true),
    });
  }
  return result;
}

export const toMap = (rows: readonly ModuleStateRecord[]) =>
  new Map(rows.map((row) => [row.moduleId, row]));

export type ModuleAccess = 'active' | 'archived' | 'inactive';

export interface EventModuleAccess {
  access: ModuleAccess;
  config: unknown;
  capabilities: string[];
}

export function capabilitiesFor(definition: ModuleDefinition) {
  return [
    moduleCapabilityKey(definition.manifest.id),
    ...definition.manifest.capabilities,
  ];
}

/** Organization-level availability; this is what `/runtime/bootstrap` advertises. */
export async function resolveOrganizationModuleCapabilities(
  ctx: RequestContext,
  deps: ModuleDeps,
): Promise<string[]> {
  const rows = toMap(await deps.activations.listOrganization(ctx));
  const availability = await evaluate(deps, ctx, rows);
  return deps.registry
    .list()
    .filter((d) => availability.get(d.manifest.id)?.available)
    .flatMap(capabilitiesFor);
}

/** Server-side effective state of one module for one event; null if the event is foreign. */
export async function resolveEventModuleAccess(
  ctx: RequestContext,
  deps: ModuleDeps,
  eventId: string,
  moduleId: string,
): Promise<EventModuleAccess | null> {
  const definition = deps.registry.get(moduleId);
  if (!definition)
    return { access: 'inactive', config: null, capabilities: [] };
  const rows = await deps.activations.listEvent(ctx, eventId);
  if (!rows) return null;
  const organization = await evaluate(deps, ctx, toMap(rows.organization));
  const event = await evaluate(deps, ctx, toMap(rows.event), organization);
  const record = rows.event.find((row) => row.moduleId === moduleId);
  if (event.get(moduleId)?.available)
    return {
      access: 'active',
      config: record!.config,
      capabilities: capabilitiesFor(definition),
    };
  return {
    access: record ? 'archived' : 'inactive',
    config: record?.config ?? null,
    capabilities: [],
  };
}

/** Capabilities and module permissions an actor holds for an event right now. */
export async function resolveEventModuleCapabilities(
  ctx: RequestContext,
  deps: ModuleDeps,
  eventId: string,
): Promise<string[] | null> {
  const rows = await deps.activations.listEvent(ctx, eventId);
  if (!rows) return null;
  const organization = await evaluate(deps, ctx, toMap(rows.organization));
  const event = await evaluate(deps, ctx, toMap(rows.event), organization);
  return deps.registry
    .list()
    .filter((d) => event.get(d.manifest.id)?.available)
    .flatMap(capabilitiesFor);
}

/** Module permissions are implied by core permissions and never granted by clients. */
export function modulePermissionsFor(
  definition: ModuleDefinition,
  ctx: RequestContext,
): Set<string> {
  return new Set(
    definition.manifest.permissions
      .filter(
        (p) =>
          ctx.permissions.has(p.key) ||
          p.impliedBy.some((core) => ctx.permissions.has(core)),
      )
      .map((p) => p.key),
  );
}

export interface ModuleView {
  id: string;
  version: string;
  displayName: string;
  description: string;
  gallery: ModuleManifest['gallery'];
  dependencies: Array<{ id: string; range: string }>;
  enabled: boolean;
  entitled: boolean;
  configValid: boolean;
  available: boolean;
  status: 'available' | 'active' | 'unavailable';
  unavailableReason: 'entitlement' | 'dependency' | 'edition' | null;
  /** Event scope: the organization has made the module available. */
  organizationEnabled?: boolean;
  config: unknown;
  stateVersion: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}
