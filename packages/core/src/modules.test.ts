import { describe, expect, it } from 'vitest';
import {
  ModuleError,
  createInMemoryModuleActivationRepository,
  createModuleRegistry,
  createRequestContext,
  listEventModules,
  moduleVersionSatisfies,
  organizationId,
  resolveEventModuleAccess,
  resolveOrganizationModuleCapabilities,
  setEventModule,
  setOrganizationModule,
  type ModuleConfigSchema,
  type ModuleDefinition,
  type ModuleManifest,
} from './index.js';

const schema: ModuleConfigSchema = {
  safeParse: (input) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
      return {
        success: false,
        error: { issues: [{ path: [], message: 'expected object' }] },
      };
    const value = input as { label?: unknown; limit?: unknown };
    const label = value?.label ?? 'default';
    const limit = value?.limit ?? 3;
    if (typeof label !== 'string' || label.length > 10)
      return {
        success: false,
        error: { issues: [{ path: ['label'], message: 'too long' }] },
      };
    if (
      !Number.isInteger(limit) ||
      (limit as number) < 1 ||
      (limit as number) > 10
    )
      return {
        success: false,
        error: { issues: [{ path: ['limit'], message: 'out of range' }] },
      };
    return { success: true, data: { label, limit } };
  },
};
const manifest = (
  over: Partial<ModuleManifest> & { id: string },
): ModuleManifest => ({
  version: '1.0.0',
  displayName: over.id,
  gallery: {
    name: { de: over.id, en: over.id },
    shortDescription: { de: over.id, en: over.id },
    longDescription: { de: over.id, en: over.id },
    category: 'other',
    icon: 'puzzle',
    source: 'official',
    editions: ['community', 'cloud'],
    entitlement: 'included',
  },
  dependencies: [],
  permissions: [],
  capabilities: [],
  tables: [],
  migrations: [],
  routes: [],
  ui: [],
  jobs: [],
  ...over,
});
const define = (
  over: Partial<ModuleManifest> & { id: string },
): ModuleDefinition => ({
  manifest: manifest(over),
  configSchema: schema,
  defaultConfig: { label: 'default', limit: 3 },
});
const noop = define({ id: 'example.noop' });
const child = define({
  id: 'example.child',
  dependencies: [{ id: 'example.noop', range: '^1.0.0' }],
});
const registry = createModuleRegistry([child, noop]);
const ctx = (org: string, permissions: string[]) =>
  createRequestContext({
    deploymentMode: 'cloud',
    organizationId: organizationId(org),
    permissions: new Set(permissions),
    capabilities: new Set(),
    correlationId: 'test',
  });
const admin = (org: string) =>
  ctx(org, [
    'organization:read',
    'organization:update',
    'event:read',
    'event:write',
  ]);

describe('module registry', () => {
  it('orders dependencies first and validates manifests', () => {
    expect(registry.list().map((m) => m.manifest.id)).toEqual([
      'example.noop',
      'example.child',
    ]);
    expect(() => createModuleRegistry([noop, noop])).toThrow(/duplicate id/);
    expect(() => createModuleRegistry([child])).toThrow(/unknown module/);
    expect(() =>
      createModuleRegistry([
        define({
          id: 'example.a',
          dependencies: [{ id: 'example.b', range: '1.0.0' }],
        }),
        define({
          id: 'example.b',
          dependencies: [{ id: 'example.a', range: '1.0.0' }],
        }),
      ]),
    ).toThrow(/cycle/);
    expect(() =>
      createModuleRegistry([
        noop,
        define({
          id: 'example.child',
          dependencies: [{ id: 'example.noop', range: '^2.0.0' }],
        }),
      ]),
    ).toThrow(/requires example.noop/);
    expect(() =>
      createModuleRegistry([define({ id: 'example.x', jobs: ['other.job'] })]),
    ).toThrow(/job other.job/);
    expect(() =>
      createModuleRegistry([
        define({
          id: 'example.x',
          permissions: [
            { key: 'core:steal', description: 'x', impliedBy: ['event:write'] },
          ],
        }),
      ]),
    ).toThrow(/must start with/);
    expect(() =>
      createModuleRegistry([
        { ...noop, defaultConfig: { label: 'much too long label' } },
      ]),
    ).toThrow(/defaultConfig/);
    expect(() =>
      createModuleRegistry([
        define({
          id: 'example.x',
          routes: [{ method: 'POST', path: '/a', archivedRead: true }],
        }),
      ]),
    ).toThrow(/archivedRead/);
  });
  it('checks semver ranges', () => {
    expect(moduleVersionSatisfies('1.4.0', '^1.2.0')).toBe(true);
    expect(moduleVersionSatisfies('1.1.9', '^1.2.0')).toBe(false);
    expect(moduleVersionSatisfies('2.0.0', '^1.2.0')).toBe(false);
    expect(moduleVersionSatisfies('0.2.5', '^0.2.1')).toBe(true);
    expect(moduleVersionSatisfies('0.3.0', '^0.2.1')).toBe(false);
    expect(moduleVersionSatisfies('1.0.0', '1.0.0')).toBe(true);
  });
});

describe('module activation', () => {
  const owned = new Map([
    ['event-a1', 'org-a'],
    ['event-b1', 'org-b'],
  ]);
  const setup = (entitled: (id: string) => boolean = () => true) => {
    const activations = createInMemoryModuleActivationRepository(
      (c, eventId) => owned.get(eventId) === c.organizationId,
    );
    return {
      activations,
      deps: {
        registry,
        activations,
        entitlements: {
          isEntitled: async (_c: unknown, id: string) => entitled(id),
        },
      },
    };
  };

  it('enables org then event, validates and normalizes config, and audits', async () => {
    const { deps, activations } = setup();
    const a = admin('org-a');
    await expect(
      setEventModule(
        a,
        deps,
        'event-a1',
        'example.noop',
        { enabled: true },
        'u',
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    await setOrganizationModule(
      a,
      deps,
      'example.noop',
      { enabled: true, config: { label: 'tpl' } },
      'u',
    );
    const view = await setEventModule(
      a,
      deps,
      'event-a1',
      'example.noop',
      { enabled: true },
      'u',
    );
    // event activation is seeded from the organization template
    expect(view).toMatchObject({
      enabled: true,
      available: true,
      config: { label: 'tpl', limit: 3 },
    });
    expect(await resolveOrganizationModuleCapabilities(a, deps)).toEqual([
      'module.example.noop',
    ]);
    expect(
      (await resolveEventModuleAccess(a, deps, 'event-a1', 'example.noop'))
        ?.access,
    ).toBe('active');
    expect(activations.audit.map((e) => e.action)).toEqual([
      'enable',
      'enable',
    ]);
  });
  it('rejects invalid configuration without writing', async () => {
    const { deps, activations } = setup();
    const a = admin('org-a');
    await expect(
      setOrganizationModule(
        a,
        deps,
        'example.noop',
        { enabled: true, config: { limit: 99 } },
        'u',
      ),
    ).rejects.toMatchObject({
      code: 'invalid_config',
      issues: [{ path: 'limit' }],
    });
    await expect(
      setOrganizationModule(a, deps, 'example.noop', { config: [] }, 'u'),
    ).rejects.toBeInstanceOf(ModuleError);
    await expect(
      setOrganizationModule(a, deps, 'unknown.module', { enabled: true }, 'u'),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await activations.listOrganization(a)).toEqual([]);
  });
  it('enforces dependencies in both directions', async () => {
    const { deps } = setup();
    const a = admin('org-a');
    await expect(
      setOrganizationModule(a, deps, 'example.child', { enabled: true }, 'u'),
    ).rejects.toMatchObject({ code: 'conflict' });
    await setOrganizationModule(
      a,
      deps,
      'example.noop',
      { enabled: true },
      'u',
    );
    await setOrganizationModule(
      a,
      deps,
      'example.child',
      { enabled: true },
      'u',
    );
    await expect(
      setOrganizationModule(a, deps, 'example.noop', { enabled: false }, 'u'),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
  it('refuses via the entitlement hook and fails closed when it throws', async () => {
    const denied = setup((id) => id !== 'example.noop');
    await expect(
      setOrganizationModule(
        admin('org-a'),
        denied.deps,
        'example.noop',
        { enabled: true },
        'u',
      ),
    ).rejects.toMatchObject({ code: 'not_entitled' });
    const broken = setup();
    const a = admin('org-a');
    await setOrganizationModule(
      a,
      broken.deps,
      'example.noop',
      { enabled: true },
      'u',
    );
    const throwing = {
      ...broken.deps,
      entitlements: {
        isEntitled: async () => {
          throw new Error('control plane down');
        },
      },
    };
    expect(await resolveOrganizationModuleCapabilities(a, throwing)).toEqual(
      [],
    );
  });
  it('loses availability but keeps data when entitlement is withdrawn or the module is disabled', async () => {
    let entitled = true;
    const { deps, activations } = setup(() => entitled);
    const a = admin('org-a');
    await setOrganizationModule(
      a,
      deps,
      'example.noop',
      { enabled: true },
      'u',
    );
    await setEventModule(
      a,
      deps,
      'event-a1',
      'example.noop',
      { enabled: true, config: { label: 'kept' } },
      'u',
    );
    entitled = false;
    const withdrawn = await resolveEventModuleAccess(
      a,
      deps,
      'event-a1',
      'example.noop',
    );
    expect(withdrawn).toMatchObject({
      access: 'archived',
      config: { label: 'kept' },
    });
    entitled = true;
    await setEventModule(
      a,
      deps,
      'event-a1',
      'example.noop',
      { enabled: false },
      'u',
    );
    const archived = await resolveEventModuleAccess(
      a,
      deps,
      'event-a1',
      'example.noop',
    );
    expect(archived).toMatchObject({ access: 'archived', capabilities: [] });
    expect(
      (await activations.listEvent(a, 'event-a1'))?.event[0],
    ).toMatchObject({ enabled: false, config: { label: 'kept', limit: 3 } });
    expect(activations.audit.map((e) => e.action)).toEqual([
      'enable',
      'enable',
      'disable',
    ]);
  });
  it('is idempotent and uses optimistic versions', async () => {
    const { deps, activations } = setup();
    const a = admin('org-a');
    await setOrganizationModule(
      a,
      deps,
      'example.noop',
      { enabled: true },
      'u',
    );
    const again = await setOrganizationModule(
      a,
      deps,
      'example.noop',
      { enabled: true },
      'u',
    );
    expect(again?.stateVersion).toBe(1);
    expect(activations.audit).toHaveLength(1);
    await expect(
      setOrganizationModule(
        a,
        deps,
        'example.noop',
        { config: { label: 'x' }, expectedVersion: 7 },
        'u',
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    const updated = await setOrganizationModule(
      a,
      deps,
      'example.noop',
      { config: { label: 'x' }, expectedVersion: 1 },
      'u',
    );
    expect(updated?.stateVersion).toBe(2);
  });
  it('requires permissions', async () => {
    const { deps } = setup();
    await expect(
      setOrganizationModule(
        ctx('org-a', ['organization:read']),
        deps,
        'example.noop',
        { enabled: true },
        'u',
      ),
    ).rejects.toThrow('Forbidden');
    await expect(
      listEventModules(ctx('org-a', []), deps, 'event-a1'),
    ).rejects.toThrow('Forbidden');
  });
  it('isolates organizations and foreign event ids', async () => {
    const { deps } = setup();
    const a = admin('org-a');
    const b = admin('org-b');
    await setOrganizationModule(
      a,
      deps,
      'example.noop',
      { enabled: true, config: { label: 'secret-a' } },
      'u',
    );
    await setEventModule(
      a,
      deps,
      'event-a1',
      'example.noop',
      { enabled: true },
      'u',
    );
    expect(
      (await listEventModules(b, deps, 'event-b1'))?.every((m) => !m.enabled),
    ).toBe(true);
    expect(
      JSON.stringify(await listEventModules(b, deps, 'event-b1')),
    ).not.toContain('secret-a');
    expect(await listEventModules(b, deps, 'event-a1')).toBeNull();
    expect(
      await setEventModule(
        b,
        deps,
        'event-a1',
        'example.noop',
        { enabled: true },
        'u',
      ),
    ).toBeNull();
    expect(
      await resolveEventModuleAccess(b, deps, 'event-a1', 'example.noop'),
    ).toBeNull();
    expect(await resolveOrganizationModuleCapabilities(b, deps)).toEqual([]);
  });
});
