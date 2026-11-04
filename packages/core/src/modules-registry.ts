const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

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
  /** Mounts the same guarded handler at an anonymous public read URL. */
  readonly publicPath?: string;
}

export interface ModuleManifest {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly description?: string;
  readonly gallery: {
    readonly name: { readonly de: string; readonly en: string };
    readonly shortDescription: { readonly de: string; readonly en: string };
    readonly longDescription: { readonly de: string; readonly en: string };
    readonly category:
      | 'timing'
      | 'scrutineering'
      | 'communication'
      | 'payments'
      | 'operations'
      | 'other';
    readonly icon: string;
    readonly screenshots?: readonly string[];
    readonly source: 'core' | 'official' | 'private';
    readonly editions: readonly ('community' | 'cloud')[];
    readonly entitlement: string;
  };
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
      if (
        route.publicPath &&
        (route.method !== 'GET' ||
          !route.archivedRead ||
          !/^\/[A-Za-z0-9_\-/:.]+$/.test(route.publicPath))
      )
        fail(`route ${key}: publicPath must be a safe archived GET path`);
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
