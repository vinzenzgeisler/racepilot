import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ModuleManifestSchema } from '@racepilot/contracts';
import {
  createInMemoryModuleActivationRepository,
  createModuleRegistry,
  createRequestContext,
  organizationId,
  type ModuleDefinition,
  type RequestContext,
} from '@racepilot/core';
import { createApp, type ApiDeps, type ModuleApiDeps } from './index.js';

const orgA = '10000000-0000-4000-8000-00000000000a';
const orgB = '10000000-0000-4000-8000-00000000000b';
const eventA = '20000000-0000-4000-8000-00000000000a';
const eventB = '20000000-0000-4000-8000-00000000000b';
const owners = new Map([
  [eventA, orgA],
  [eventB, orgB],
]);

const configSchema = z
  .object({
    label: z.string().max(10).default('default'),
    limit: z.number().int().min(1).max(10).default(3),
  })
  .strict();
const noopDefinition: ModuleDefinition = {
  manifest: {
    id: 'example.noop',
    version: '1.0.0',
    displayName: 'Example no-op',
    gallery: {
      name: { de: 'No-op', en: 'No-op' },
      shortDescription: { de: 'Beispielmodul', en: 'Example module' },
      longDescription: { de: 'Beispielmodul', en: 'Example module' },
      category: 'other',
      icon: 'puzzle',
      source: 'official',
      editions: ['community', 'cloud'],
      entitlement: 'included',
    },
    dependencies: [],
    permissions: [
      {
        key: 'example.noop:read',
        description: 'Read',
        impliedBy: ['event:read'],
      },
      {
        key: 'example.noop:write',
        description: 'Write',
        impliedBy: ['event:write'],
      },
    ],
    capabilities: ['example.noop.echo'],
    tables: ['example_noop_item'],
    migrations: ['0099_example_noop'],
    routes: [
      {
        method: 'GET',
        path: '/ping',
        permission: 'example.noop:read',
        archivedRead: true,
      },
      { method: 'POST', path: '/echo', permission: 'example.noop:write' },
    ],
    ui: [{ entryPoint: 'example-noop-panel', navigationLabel: 'No-op' }],
    jobs: ['example.noop.tick'],
  },
  configSchema,
  defaultConfig: configSchema.parse({}),
};
const registry = createModuleRegistry([noopDefinition]);

function build(
  options: { entitled?: () => boolean; routes?: ModuleApiDeps['routes'] } = {},
) {
  const activations = createInMemoryModuleActivationRepository(
    (ctx, eventId) => owners.get(eventId) === ctx.organizationId,
  );
  const modules: ModuleApiDeps = {
    registry,
    activations,
    entitlements: { isEntitled: async () => options.entitled?.() ?? true },
    routes: options.routes ?? {
      'example.noop': (router) => {
        router.get('/ping', (c) =>
          c.json({ pong: true, config: c.get('module').config }),
        );
        router.post('/echo', (c) =>
          c.json({
            capabilities: [...c.get('module').context.capabilities],
          }),
        );
      },
    },
  };
  // Test-only resolver: a real Cloud assembly derives this from verified host + membership.
  const contextFor = (request: Request): RequestContext | null => {
    const org = { a: orgA, b: orgB }[request.headers.get('x-test-org') ?? ''];
    const permissions = request.headers.get('x-test-permissions');
    if (!org || permissions === null) return null;
    return createRequestContext({
      deploymentMode: 'cloud',
      organizationId: organizationId(org),
      subject: { issuer: 'test', subject: `user-${org}` },
      permissions: new Set(permissions.split(',').filter(Boolean)),
      capabilities: new Set(),
      correlationId: 'test',
    });
  };
  const deps: ApiDeps = {
    config: { deploymentMode: 'cloud' },
    organizations: {
      getById: async (ctx) => ({
        id: ctx.organizationId,
        slug: ctx.organizationId === orgA ? 'a' : 'b',
        name: 'Org',
        status: 'active',
        contactEmail: null,
        websiteUrl: null,
        timezone: 'UTC',
        locale: 'en',
        currency: 'EUR',
      }),
      update: async () => null,
    },
    events: { listByOrganization: async () => [], getById: async () => null },
    contextResolvers: {
      public: async (request) => {
        const ctx = contextFor(request);
        return ctx && createRequestContext({ ...ctx, permissions: new Set() });
      },
      member: async (request) => contextFor(request),
    },
    modules,
  };
  return { app: createApp(deps), activations };
}
const ADMIN = 'organization:read,organization:update,event:read,event:write';
const as = (org: 'a' | 'b', permissions = ADMIN, extra: HeadersInit = {}) => ({
  'x-test-org': org,
  'x-test-permissions': permissions,
  'content-type': 'application/json',
  ...extra,
});
const patch = (
  app: ReturnType<typeof build>['app'],
  url: string,
  body: unknown,
  headers = as('a'),
) => app.request(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
const bootstrap = async (
  app: ReturnType<typeof build>['app'],
  org: 'a' | 'b' = 'a',
) =>
  (await (await app.request('/runtime/bootstrap', { headers: as(org) })).json())
    .capabilities as string[];
const enableAll = async (app: ReturnType<typeof build>['app']) => {
  expect(
    (
      await patch(app, '/admin/organization/modules/example.noop', {
        enabled: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await patch(app, `/admin/events/${eventA}/modules/example.noop`, {
        enabled: true,
      })
    ).status,
  ).toBe(200);
};

describe('event module API', () => {
  it('ships a manifest that satisfies the public contract', () => {
    expect(ModuleManifestSchema.parse(noopDefinition.manifest)).toBeTruthy();
  });

  it('activates and deactivates per organization and event, advertising capabilities', async () => {
    const { app, activations } = build();
    expect(await bootstrap(app)).not.toContain('module.example.noop');
    const orgEnabled = await patch(
      app,
      '/admin/organization/modules/example.noop',
      { enabled: true, config: { label: 'tpl' } },
    );
    expect(orgEnabled.status).toBe(200);
    expect(await bootstrap(app)).toEqual(
      expect.arrayContaining(['module.example.noop', 'example.noop.echo']),
    );
    // organization enablement alone does not activate any event
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/ping`, {
          headers: as('a'),
        })
      ).status,
    ).toBe(404);
    const enabled = await patch(
      app,
      `/admin/events/${eventA}/modules/example.noop`,
      { enabled: true },
    );
    expect(await enabled.json()).toMatchObject({
      enabled: true,
      available: true,
      config: { label: 'tpl', limit: 3 },
    });
    const ping = await app.request(
      `/admin/events/${eventA}/modules/example.noop/ping`,
      { headers: as('a') },
    );
    expect(ping.status).toBe(200);
    expect(await ping.json()).toEqual({
      pong: true,
      config: { label: 'tpl', limit: 3 },
    });
    const list = await (
      await app.request(`/admin/events/${eventA}/modules`, { headers: as('a') })
    ).json();
    expect(list.modules).toHaveLength(1);
    expect(list.modules[0]).toMatchObject({
      id: 'example.noop',
      organizationEnabled: true,
      available: true,
    });
    const off = await patch(
      app,
      `/admin/events/${eventA}/modules/example.noop`,
      { enabled: false, reason: 'event cancelled' },
    );
    expect(await off.json()).toMatchObject({
      enabled: false,
      available: false,
      config: { label: 'tpl' },
    });
    // deactivated: writes are blocked, archived reads stay possible
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/echo`, {
          method: 'POST',
          headers: as('a'),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/ping`, {
          headers: as('a'),
        })
      ).status,
    ).toBe(200);
    expect(activations.audit.map((a) => a.action)).toEqual([
      'enable',
      'enable',
      'disable',
    ]);
    expect(activations.audit[2]?.reason).toBe('event cancelled');
  });

  it('blocks module routes server-side while inactive, whatever the client claims', async () => {
    const { app } = build();
    const forged = as('a', ADMIN, {
      'x-capabilities': 'module.example.noop',
      'x-module': 'example.noop',
      cookie: 'capabilities=module.example.noop',
    });
    for (const [url, init] of [
      [
        `/admin/events/${eventA}/modules/example.noop/ping`,
        { headers: forged },
      ],
      [
        `/admin/events/${eventA}/modules/example.noop/ping?capabilities=module.example.noop`,
        { headers: forged },
      ],
      [
        `/admin/events/${eventA}/modules/example.noop/echo`,
        {
          method: 'POST',
          headers: forged,
          body: JSON.stringify({ capabilities: ['module.example.noop'] }),
        },
      ],
    ] as const)
      expect((await app.request(url, init)).status).toBe(404);
    // enabled for the organization but not for the event: still blocked
    await patch(app, '/admin/organization/modules/example.noop', {
      enabled: true,
    });
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/ping`, {
          headers: forged,
        })
      ).status,
    ).toBe(404);
    // withdrawing organization availability deactivates event usage without deleting its state
    await patch(app, `/admin/events/${eventA}/modules/example.noop`, {
      enabled: true,
    });
    await patch(app, '/admin/organization/modules/example.noop', {
      enabled: false,
    });
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/echo`, {
          method: 'POST',
          headers: forged,
        })
      ).status,
    ).toBe(404);
    expect(await bootstrap(app)).not.toContain('module.example.noop');
  });

  it('passes server-computed capabilities and module permissions to module routes', async () => {
    const { app } = build();
    await enableAll(app);
    const echo = await app.request(
      `/admin/events/${eventA}/modules/example.noop/echo`,
      { method: 'POST', headers: as('a') },
    );
    expect(echo.status).toBe(200);
    expect((await echo.json()).capabilities).toEqual(
      expect.arrayContaining(['module.example.noop']),
    );
    // reader may call GET but lacks the implied write permission
    const reader = as('a', 'event:read');
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/ping`, {
          headers: reader,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/echo`, {
          method: 'POST',
          headers: reader,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/ping`, {
          headers: { 'x-test-org': 'a' },
        })
      ).status,
    ).toBe(401);
  });

  it('rejects invalid configuration and permission violations', async () => {
    const { app, activations } = build();
    const invalid = await patch(
      app,
      '/admin/organization/modules/example.noop',
      { enabled: true, config: { limit: 99, extra: 1 } },
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).issues.length).toBeGreaterThan(0);
    expect(
      (
        await patch(app, '/admin/organization/modules/example.noop', {
          config: 'nope',
        })
      ).status,
    ).toBe(400);
    expect(
      (await patch(app, '/admin/organization/modules/example.noop', {})).status,
    ).toBe(400);
    expect(
      (
        await patch(app, '/admin/organization/modules/unknown.module', {
          enabled: true,
        })
      ).status,
    ).toBe(404);
    expect(
      await activations.listOrganization(
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(orgA),
          permissions: new Set(),
          capabilities: new Set(),
          correlationId: 'x',
        }),
      ),
    ).toEqual([]);
    expect(
      (
        await patch(
          app,
          '/admin/organization/modules/example.noop',
          { enabled: true },
          as('a', 'organization:read'),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await patch(
          app,
          `/admin/events/${eventA}/modules/example.noop`,
          { enabled: true },
          as('a', 'event:read'),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/admin/organization/modules', {
          headers: as('a', ''),
        })
      ).status,
    ).toBe(403);
    expect((await app.request('/admin/organization/modules')).status).toBe(401);
    // event activation requires organization availability
    expect(
      (
        await patch(app, `/admin/events/${eventA}/modules/example.noop`, {
          enabled: true,
        })
      ).status,
    ).toBe(409);
    // stale version
    await patch(app, '/admin/organization/modules/example.noop', {
      enabled: true,
    });
    expect(
      (
        await patch(app, '/admin/organization/modules/example.noop', {
          config: { label: 'x' },
          expectedVersion: 5,
        })
      ).status,
    ).toBe(409);
  });

  it('lets the entitlement hook refuse activation and withdraw availability', async () => {
    let entitled = true;
    const { app } = build({ entitled: () => entitled });
    await enableAll(app);
    expect(await bootstrap(app)).toContain('module.example.noop');
    entitled = false;
    expect(await bootstrap(app)).not.toContain('module.example.noop');
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/echo`, {
          method: 'POST',
          headers: as('a'),
        })
      ).status,
    ).toBe(404);
    const refused = await patch(
      app,
      '/admin/organization/modules/example.noop',
      { config: { label: 'y' } },
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'Module not available' });
    const view = await (
      await app.request('/admin/organization/modules', { headers: as('a') })
    ).json();
    expect(view.modules[0]).toMatchObject({
      enabled: true,
      entitled: false,
      available: false,
    });
  });

  it('isolates modules, configuration and events between organizations', async () => {
    const { app } = build();
    await patch(app, '/admin/organization/modules/example.noop', {
      enabled: true,
      config: { label: 'secret-a' },
    });
    await patch(app, `/admin/events/${eventA}/modules/example.noop`, {
      enabled: true,
    });
    // Org B sees nothing of org A
    const listB = await (
      await app.request('/admin/organization/modules', { headers: as('b') })
    ).json();
    expect(listB.modules[0]).toMatchObject({
      enabled: false,
      stateVersion: null,
    });
    expect(JSON.stringify(listB)).not.toContain('secret-a');
    expect(await bootstrap(app, 'b')).not.toContain('module.example.noop');
    // foreign event ids are indistinguishable from missing ones
    for (const request of [
      app.request(`/admin/events/${eventA}/modules`, { headers: as('b') }),
      patch(
        app,
        `/admin/events/${eventA}/modules/example.noop`,
        { enabled: true },
        as('b'),
      ),
      patch(
        app,
        `/admin/events/${eventA}/modules/example.noop`,
        { enabled: false },
        as('b'),
      ),
      app.request(`/admin/events/${eventA}/modules/example.noop/ping`, {
        headers: as('b'),
      }),
      app.request(`/admin/events/${eventA}/modules/example.noop/echo`, {
        method: 'POST',
        headers: as('b'),
      }),
    ])
      expect((await request).status).toBe(404);
    // Org B enabling its own module and event neither affects A nor needs A's data
    await patch(
      app,
      '/admin/organization/modules/example.noop',
      { enabled: true },
      as('b'),
    );
    expect(
      (
        await patch(
          app,
          `/admin/events/${eventB}/modules/example.noop`,
          { enabled: true },
          as('b'),
        )
      ).status,
    ).toBe(200);
    const pingB = await (
      await app.request(`/admin/events/${eventB}/modules/example.noop/ping`, {
        headers: as('b'),
      })
    ).json();
    expect(pingB.config.label).toBe('default');
    // Event B (module off) vs Event A (module on) within the same organization pair
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/ping`, {
          headers: as('b'),
        })
      ).status,
    ).toBe(404);
  });

  it('refuses inconsistent assemblies', () => {
    expect(() => build({ routes: {} })).toThrow(/without a handler/);
    expect(() =>
      build({
        routes: {
          'example.noop': (router) => {
            router.get('/ping', (c) => c.json({}));
            router.post('/echo', (c) => c.json({}));
            router.get('/sneaky', (c) => c.json({}));
          },
        },
      }),
    ).toThrow(/undeclared route GET \/sneaky/);
  });
});

describe('event module API in Community mode', () => {
  it('activates everything locally without an entitlement port', async () => {
    const activations = createInMemoryModuleActivationRepository(
      (_ctx, eventId) => eventId === eventA,
    );
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: orgA },
      organizations: {
        getById: async (ctx) => ({
          id: ctx.organizationId,
          slug: 'a',
          name: 'Org',
          status: 'active',
          contactEmail: null,
          websiteUrl: null,
          timezone: 'UTC',
          locale: 'en',
          currency: 'EUR',
        }),
        update: async () => null,
      },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({ issuer: 'i', subject: 's' }),
      },
      memberships: {
        resolvePermissions: async () => new Set(ADMIN.split(',')),
      },
      modules: {
        registry,
        activations,
        routes: {
          'example.noop': (r) => {
            r.get('/ping', (c) => c.json({ ok: true }));
            r.post('/echo', (c) => c.json({ ok: true }));
          },
        },
      },
    });
    const headers = {
      authorization: 'Bearer t',
      'content-type': 'application/json',
    };
    const send = (url: string, body: unknown) =>
      app.request(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
    expect(
      (
        await send('/admin/organization/modules/example.noop', {
          enabled: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`/admin/events/${eventA}/modules/example.noop`, {
          enabled: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/admin/events/${eventA}/modules/example.noop/ping`, {
          headers,
        })
      ).status,
    ).toBe(200);
    // another event of the single organization stays untouched
    expect(
      (
        await app.request(`/admin/events/${eventB}/modules/example.noop/ping`, {
          headers,
        })
      ).status,
    ).toBe(404);
    const capabilities = (
      await (await app.request('/runtime/bootstrap?capabilities=forged')).json()
    ).capabilities;
    expect(capabilities).toContain('module.example.noop');
  });
});
