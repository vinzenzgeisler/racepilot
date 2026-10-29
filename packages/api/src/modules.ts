import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  ModuleError,
  createRequestContext,
  listEventModules,
  listOrganizationModules,
  modulePermissionsFor,
  resolveEventModuleAccess,
  setEventModule,
  setOrganizationModule,
  type ModuleDeps,
  type RequestContext,
} from '@racepilot/core';
import {
  ModuleChangeRequest,
  ModuleListResponse,
  ModuleViewSchema,
} from '@racepilot/contracts';

/** Per-request state a guarded module route receives; set only by the server guard. */
export interface ModuleRequest {
  readonly context: RequestContext;
  readonly eventId: string;
  readonly moduleId: string;
  readonly config: unknown;
}
export type ModuleEnv = { Variables: { module: ModuleRequest } };
export type ModuleRouter = Hono<ModuleEnv>;
export interface ModuleApiDeps extends ModuleDeps {
  /** Trusted route installers keyed by module id; paths must match the manifest. */
  routes?: Readonly<Record<string, (router: ModuleRouter) => void>>;
}
type ContextResolver = (request: Request) => Promise<RequestContext | null>;

const actorOf = (context: RequestContext) =>
  context.subject
    ? `${context.subject.issuer}|${context.subject.subject}`
    : 'unknown';

function failure(c: Context, error: unknown) {
  if (error instanceof ModuleError) {
    if (error.code === 'not_found') return c.json({ error: 'Not found' }, 404);
    if (error.code === 'invalid_config')
      return c.json({ error: 'Invalid request', issues: error.issues }, 400);
    if (error.code === 'not_entitled')
      return c.json({ error: 'Module not available' }, 403);
    return c.json({ error: error.message }, 409);
  }
  if (error instanceof Error && error.message === 'Forbidden')
    return c.json({ error: 'Forbidden' }, 403);
  throw error;
}

/** Mounts admin management routes and guarded module routes onto the app. */
export function installModules(
  app: Hono,
  deps: ModuleApiDeps,
  resolveMemberContext: ContextResolver,
) {
  const respond = async <T>(
    c: Context,
    run: (ctx: RequestContext) => Promise<T>,
  ) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    try {
      return await run(context);
    } catch (error) {
      return failure(c, error);
    }
  };
  const readChange = async (c: Context) => {
    const parsed = ModuleChangeRequest.safeParse(
      await c.req.json().catch(() => null),
    );
    return parsed.success ? parsed.data : null;
  };

  app.get('/admin/organization/modules', (c) =>
    respond(c, async (ctx) =>
      c.json(
        ModuleListResponse.parse({
          modules: await listOrganizationModules(ctx, deps),
        }),
      ),
    ),
  );
  app.patch('/admin/organization/modules/:moduleId', async (c) => {
    const change = await readChange(c);
    if (!change) return c.json({ error: 'Invalid request' }, 400);
    return respond(c, async (ctx) => {
      const module = await setOrganizationModule(
        ctx,
        deps,
        c.req.param('moduleId'),
        change,
        actorOf(ctx),
      );
      return module
        ? c.json(ModuleViewSchema.parse(module))
        : c.json({ error: 'Not found' }, 404);
    });
  });
  app.get('/admin/events/:eventId/modules', (c) =>
    respond(c, async (ctx) => {
      const modules = await listEventModules(ctx, deps, c.req.param('eventId'));
      return modules
        ? c.json(ModuleListResponse.parse({ modules }))
        : c.json({ error: 'Not found' }, 404);
    }),
  );
  app.patch('/admin/events/:eventId/modules/:moduleId', async (c) => {
    const change = await readChange(c);
    if (!change) return c.json({ error: 'Invalid request' }, 400);
    return respond(c, async (ctx) => {
      const module = await setEventModule(
        ctx,
        deps,
        c.req.param('eventId'),
        c.req.param('moduleId'),
        change,
        actorOf(ctx),
      );
      return module
        ? c.json(ModuleViewSchema.parse(module))
        : c.json({ error: 'Not found' }, 404);
    });
  });

  for (const definition of deps.registry.list()) {
    const { manifest } = definition;
    const install = deps.routes?.[manifest.id];
    if (!install) {
      if (manifest.routes.length > 0)
        throw new Error(
          `Module ${manifest.id} declares routes without a handler`,
        );
      continue;
    }
    const router: ModuleRouter = new Hono<ModuleEnv>();
    install(router);
    const declared = new Set(
      manifest.routes.map((r) => `${r.method} ${r.path}`),
    );
    for (const route of router.routes)
      if (!declared.has(`${route.method} ${route.path}`))
        throw new Error(
          `Module ${manifest.id} serves undeclared route ${route.method} ${route.path}`,
        );
    const base = `/admin/events/:eventId/modules/${manifest.id}`;
    for (const route of manifest.routes) {
      app.on(route.method, `${base}${route.path}`, async (c, next) => {
        const context = await resolveMemberContext(c.req.raw);
        if (!context) return c.json({ error: 'Unauthorized' }, 401);
        if (!context.permissions.has('event:read'))
          return c.json({ error: 'Forbidden' }, 403);
        const eventId = c.req.param('eventId') ?? '';
        const access = await resolveEventModuleAccess(
          context,
          deps,
          eventId,
          manifest.id,
        ).catch(() => null);
        const safeRead = route.method === 'GET';
        if (
          !access ||
          !(
            access.access === 'active' ||
            (access.access === 'archived' && route.archivedRead && safeRead)
          )
        )
          return c.json({ error: 'Not found' }, 404);
        const permissions = new Set([
          ...context.permissions,
          ...modulePermissionsFor(definition, context),
        ]);
        if (route.permission && !permissions.has(route.permission))
          return c.json({ error: 'Forbidden' }, 403);
        (c as unknown as Context<ModuleEnv>).set('module', {
          context: createRequestContext({
            ...context,
            permissions,
            capabilities: new Set([
              ...context.capabilities,
              ...access.capabilities,
            ]),
          }),
          eventId,
          moduleId: manifest.id,
          config: access.config,
        } satisfies ModuleRequest);
        await next();
      });
    }
    app.route(base, router as unknown as Hono);
  }
}
