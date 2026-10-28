import type { RequestContext } from './index.js';

/**
 * Optional event modules (ADR 0004). A module is statically registered, reviewed
 * code that is activated per organization and per event. The server is the only
 * authority on availability; client flags are presentation hints.
 */

export type ModuleHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface ModulePermissionDeclaration {
  /** Must start with the module id and a colon, e.g. `example.noop:read`. */
  readonly key: string;
  readonly description: string;
  /** Core permissions that imply this module permission. */
  readonly impliedBy: readonly string[];
}
export interface ModuleRouteDeclaration {
  readonly method: ModuleHttpMethod;
  /** Relative to `/admin/events/:eventId/modules/<id>`; never the bare root. */
  readonly path: string;
  readonly permission?: string;
  /** Safe reads stay possible after deactivation so historical data remains accessible. */
  readonly archivedRead?: boolean;
}
export interface ModuleManifest {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly description?: string;
  readonly dependencies: ReadonlyArray<{
    readonly id: string;
    readonly range: string;
  }>;
  readonly permissions: readonly ModulePermissionDeclaration[];
  /** Extra capability keys exposed when active; `module.<id>` is always exposed. */
  readonly capabilities: readonly string[];
  readonly tables: readonly string[];
  readonly migrations: readonly string[];
  readonly routes: readonly ModuleRouteDeclaration[];
  readonly ui: ReadonlyArray<{
    readonly entryPoint: string;
    readonly navigationLabel?: string;
    readonly permission?: string;
  }>;
  readonly jobs: readonly string[];
}
/** Structural subset of a Zod schema so core stays free of validation libraries. */
export interface ModuleConfigSchema {
  safeParse(input: unknown):
    | { success: true; data: unknown }
    | {
        success: false;
        error: {
          issues: ReadonlyArray<{
            path: ReadonlyArray<PropertyKey>;
            message: string;
          }>;
        };
      };
}
export interface ModuleDefinition {
  readonly manifest: ModuleManifest;
  readonly configSchema: ModuleConfigSchema;
  readonly defaultConfig: unknown;
}

export type ModuleErrorCode =
  'not_found' | 'forbidden' | 'invalid_config' | 'conflict' | 'not_entitled';
export class ModuleError extends Error {
  constructor(
    readonly code: ModuleErrorCode,
    message: string,
    readonly issues: ReadonlyArray<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = 'ModuleError';
  }
}

const MODULE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RANGE = /^\^?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TABLE = /^[a-z][a-z0-9_]*$/;
const TASK = /^[a-z][a-z0-9_.-]{0,119}$/;
const parseVersion = (value: string) =>
  value.split('.').map(Number) as [number, number, number];

/** Exact or caret (`^1.2.3`) range check; for 0.x the minor is the breaking boundary. */
export function moduleVersionSatisfies(version: string, range: string) {
  if (!SEMVER.test(version) || !RANGE.test(range)) return false;
  const [major, minor, patch] = parseVersion(version);
  const caret = range.startsWith('^');
  const [rMajor, rMinor, rPatch] = parseVersion(caret ? range.slice(1) : range);
  if (!caret) return major === rMajor && minor === rMinor && patch === rPatch;
  if (major !== rMajor) return false;
  if (rMajor === 0) return minor === rMinor && patch >= rPatch;
  return minor > rMinor || (minor === rMinor && patch >= rPatch);
}

export interface ModuleRegistry {
  /** Dependencies always precede their dependents. */
  list(): readonly ModuleDefinition[];
  get(id: string): ModuleDefinition | undefined;
}

export function moduleCapabilityKey(moduleId: string) {
  return `module.${moduleId}`;
}

/** Validates statically registered modules once at process assembly; any defect throws. */
export function createModuleRegistry(
  definitions: readonly ModuleDefinition[],
): ModuleRegistry {
  const byId = new Map<string, ModuleDefinition>();
  const claimed = {
    table: new Set<string>(),
    job: new Set<string>(),
    permission: new Set<string>(),
  };
  for (const definition of definitions) {
    const { manifest } = definition;
    const fail = (message: string): never => {
      throw new Error(`Invalid module ${manifest.id}: ${message}`);
    };
    if (!MODULE_ID.test(manifest.id)) fail('invalid id');
    if (byId.has(manifest.id)) fail('duplicate id');
    if (!SEMVER.test(manifest.version)) fail('version must be semver');
    if (!manifest.displayName.trim()) fail('displayName is required');
    const dependencyIds = new Set<string>();
    for (const dependency of manifest.dependencies) {
      if (dependency.id === manifest.id) fail('cannot depend on itself');
      if (!RANGE.test(dependency.range)) fail('invalid dependency range');
      if (dependencyIds.has(dependency.id)) fail('duplicate dependency');
      dependencyIds.add(dependency.id);
    }
    const permissionKeys = new Set<string>();
    for (const permission of manifest.permissions) {
      if (!permission.key.startsWith(`${manifest.id}:`))
        fail(`permission ${permission.key} must start with "${manifest.id}:"`);
      if (
        permissionKeys.has(permission.key) ||
        claimed.permission.has(permission.key)
      )
        fail(`duplicate permission ${permission.key}`);
      if (permission.impliedBy.length === 0)
        fail(`permission ${permission.key} must be implied by a core role`);
      permissionKeys.add(permission.key);
      claimed.permission.add(permission.key);
    }
    for (const table of manifest.tables) {
      if (!TABLE.test(table) || claimed.table.has(table))
        fail(`invalid or duplicate table ${table}`);
      claimed.table.add(table);
    }
    for (const job of manifest.jobs) {
      if (
        !TASK.test(job) ||
        !job.startsWith(`${manifest.id}.`) ||
        claimed.job.has(job)
      )
        fail(`job ${job} must be unique and start with "${manifest.id}."`);
      claimed.job.add(job);
    }
    const seenRoutes = new Set<string>();
    for (const route of manifest.routes) {
      if (
        !/^\/[A-Za-z0-9_\-/:.]+$/.test(route.path) ||
        route.path.includes('//')
      )
        fail(`invalid route path ${route.path}`);
      const key = `${route.method} ${route.path}`;
      if (seenRoutes.has(key)) fail(`duplicate route ${key}`);
      seenRoutes.add(key);
      if (route.permission && !permissionKeys.has(route.permission))
        fail(`route ${key} uses undeclared permission`);
      if (route.archivedRead && route.method !== 'GET')
        fail(`route ${key}: only GET may be archivedRead`);
    }
    for (const entry of manifest.ui)
      if (entry.permission && !permissionKeys.has(entry.permission))
        fail(`ui ${entry.entryPoint} uses undeclared permission`);
    const config = definition.configSchema.safeParse(definition.defaultConfig);
    if (!config.success || !isObject(config.data))
      fail('defaultConfig must be an object satisfying configSchema');
    byId.set(manifest.id, definition);
  }
  // Topological order; rejects unknown dependencies, unsatisfied ranges, and cycles.
  const ordered: ModuleDefinition[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting')
      throw new Error(`Module dependency cycle at ${id}`);
    state.set(id, 'visiting');
    const definition = byId.get(id)!;
    for (const dependency of definition.manifest.dependencies) {
      const target = byId.get(dependency.id);
      if (!target)
        throw new Error(
          `Module ${id} depends on unknown module ${dependency.id}`,
        );
      if (!moduleVersionSatisfies(target.manifest.version, dependency.range))
        throw new Error(
          `Module ${id} requires ${dependency.id} ${dependency.range}, found ${target.manifest.version}`,
        );
      visit(dependency.id);
    }
    state.set(id, 'done');
    ordered.push(definition);
  };
  for (const id of byId.keys()) visit(id);
  return { list: () => ordered, get: (id) => byId.get(id) };
}

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

const isObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1,
          ),
        )
      : v,
  );
const entitled = async (deps: ModuleDeps, ctx: RequestContext, id: string) => {
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
}
async function evaluate(
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
const toMap = (rows: readonly ModuleStateRecord[]) =>
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
  dependencies: Array<{ id: string; range: string }>;
  enabled: boolean;
  entitled: boolean;
  configValid: boolean;
  available: boolean;
  /** Event scope: the organization has made the module available. */
  organizationEnabled?: boolean;
  config: unknown;
  stateVersion: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}
const view = (
  definition: ModuleDefinition,
  record: ModuleStateRecord | undefined,
  availability: ModuleAvailability,
  organizationEnabled?: boolean,
): ModuleView => ({
  id: definition.manifest.id,
  version: definition.manifest.version,
  displayName: definition.manifest.displayName,
  description: definition.manifest.description ?? '',
  dependencies: definition.manifest.dependencies.map((d) => ({ ...d })),
  enabled: record?.enabled ?? false,
  entitled: availability.entitled,
  configValid: availability.configValid,
  available: availability.available,
  ...(organizationEnabled === undefined ? {} : { organizationEnabled }),
  config: record?.config ?? definition.defaultConfig,
  stateVersion: record?.version ?? null,
  updatedAt: record?.updatedAt.toISOString() ?? null,
  updatedBy: record?.updatedBy ?? null,
});
const need = (ctx: RequestContext, permission: string) => {
  if (!ctx.permissions.has(permission)) throw new Error('Forbidden');
};

async function organizationViews(
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
async function eventViews(
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
