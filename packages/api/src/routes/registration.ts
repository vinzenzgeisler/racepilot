import type { ApiRoutesContext } from './context.js';
import { registerWorkflowRoutes } from './workflow.js';

import { z } from 'zod';
import { validateRegistrationImage } from '../registration-assets.js';

import {
  RegistrationSettingsSchema,
  RegistrationFormConfigSchema,
  RegistrationFormConfigPatchSchema,
  defaultRegistrationFormConfig,
  ResumeRegistrationRequestSchema,
} from '@racepilot/contracts';

export function registerRegistrationRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolvePublicContext, resolveMemberContext } = context;
  app.get('/admin/organization/registration-form-config', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.registrationFormConfigs)
      return c.json({ error: 'Not found' }, 404);
    const config = await deps.registrationFormConfigs.getOrganization(context);
    return c.json({
      config: config
        ? RegistrationFormConfigSchema.parse(config)
        : defaultRegistrationFormConfig,
    });
  });
  app.post('/admin/organization/registration-assets', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:update'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.objectStorage)
      return c.json({ error: 'Storage unavailable' }, 503);
    const form = await c.req.formData().catch(() => null);
    const kind = form?.get('kind');
    const file = form?.get('file');
    if (
      !form ||
      !['logoLight', 'logoDark', 'headerImage'].includes(String(kind)) ||
      !(file instanceof File)
    )
      return c.json({ error: 'Invalid image' }, 400);
    const maxBytes = kind === 'headerImage' ? 6_000_000 : 1_000_000;
    if (file.size === 0 || file.size > maxBytes)
      return c.json({ error: 'Invalid image size' }, 413);
    try {
      const checked = validateRegistrationImage(
        String(kind),
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      );
      const stored = await deps.objectStorage.put({
        organizationId: context.organizationId,
        body: checked.body,
        contentType: checked.contentType,
      });
      return c.json(
        {
          objectId: stored.objectId,
          contentType: stored.contentType,
          size: stored.size,
        },
        201,
      );
    } catch {
      return c.json({ error: 'Unsupported or unsafe image' }, 400);
    }
  });
  app.get(
    '/public/organizations/:organizationId/events/:slug/registration-assets/:objectId',
    async (c) => {
      const context = await resolvePublicContext(c.req.raw);
      const organizationParam = c.req.param('organizationId');
      if (
        !context ||
        organizationParam !== context.organizationId ||
        !deps.objectStorage
      )
        return c.json({ error: 'Not found' }, 404);
      try {
        const form = await deps.publicRegistration?.getForm(
          context,
          c.req.param('slug'),
        );
        if (!form) return c.json({ error: 'Not found' }, 404);
        const formRecord = form as Record<string, unknown>;
        const formConfig = RegistrationFormConfigPatchSchema.parse(
          formRecord.registrationFormConfig ?? {},
        );
        const branding = formConfig.branding;
        const allowedObjectIds = new Set(
          [
            branding?.logoLightObjectId,
            branding?.logoDarkObjectId,
            branding?.headerImageObjectId,
          ].filter((objectId): objectId is string => Boolean(objectId)),
        );
        const objectId = c.req.param('objectId');
        if (!allowedObjectIds.has(objectId))
          return c.json({ error: 'Not found' }, 404);
        const object = await deps.objectStorage.get(
          context.organizationId,
          objectId,
        );
        if (
          !object ||
          !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(
            object.ref.contentType,
          )
        )
          return c.json({ error: 'Not found' }, 404);
        c.header('Content-Type', object.ref.contentType);
        c.header('X-Content-Type-Options', 'nosniff');
        c.header('Content-Security-Policy', "default-src 'none'; sandbox");
        c.header('Cache-Control', 'public, max-age=86400, immutable');
        return new Response(Buffer.from(object.body), {
          headers: c.res.headers,
        });
      } catch {
        return c.json({ error: 'Not found' }, 404);
      }
    },
  );
  app.put('/admin/organization/registration-form-config', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:update'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.registrationFormConfigs)
      return c.json({ error: 'Not found' }, 404);
    const parsed = RegistrationFormConfigSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json({ error: 'Invalid registration form configuration' }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : 'unknown';
    return c.json({
      config: await deps.registrationFormConfigs.updateOrganization(
        context,
        parsed.data,
        actor,
      ),
    });
  });
  app.get('/admin/events/:eventId/registration-form-config', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.registrationFormConfigs)
      return c.json({ error: 'Not found' }, 404);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Not found' }, 404);
    const config = await deps.registrationFormConfigs.getEvent(
      context,
      eventId,
    );
    return config === null
      ? c.json({ error: 'Not found' }, 404)
      : c.json({ config: RegistrationFormConfigPatchSchema.parse(config) });
  });
  app.put('/admin/events/:eventId/registration-form-config', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('event:write'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.registrationFormConfigs)
      return c.json({ error: 'Not found' }, 404);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Not found' }, 404);
    const parsed = RegistrationFormConfigPatchSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0)
      return c.json({ error: 'Invalid registration form configuration' }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : 'unknown';
    const config = await deps.registrationFormConfigs.updateEvent(
      context,
      eventId,
      parsed.data as Record<string, unknown>,
      actor,
    );
    return config === null
      ? c.json({ error: 'Not found' }, 404)
      : c.json({ config: RegistrationFormConfigPatchSchema.parse(config) });
  });
  app.post('/public/registration/resume', async (c) => {
    const context = await resolvePublicContext(c.req.raw);
    const parsed = ResumeRegistrationRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!context || !parsed.success || !deps.publicRegistration?.resumeDraft)
      return c.json({ error: 'Resume link unavailable' }, 404);
    try {
      const result = await deps.publicRegistration.resumeDraft(
        context,
        parsed.data.token,
      );
      return result
        ? c.json(result)
        : c.json({ error: 'Resume link unavailable' }, 404);
    } catch {
      return c.json({ error: 'Resume link unavailable' }, 404);
    }
  });
  app.post('/public/registration/verify', async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = z.string().min(1).max(512).safeParse(body?.token);
    if (!token.success || !deps.publicRegistration)
      return c.json({ verified: false }, 200);
    const context = await resolvePublicContext(c.req.raw);
    if (!context) return c.json({ verified: false }, 200);
    const verified = await deps.publicRegistration
      .verify(context, token.data)
      .catch(() => false);
    return c.json({ verified }, 200);
  });
  registerWorkflowRoutes(context);

  app.get('/admin/organization/registration-settings', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:read'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.registrationSettings) return c.json({ error: 'Not found' }, 404);
    return c.json(
      RegistrationSettingsSchema.parse(
        await deps.registrationSettings.get(context),
      ),
    );
  });
  app.patch('/admin/organization/registration-settings', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('organization:update'))
      return c.json({ error: 'Forbidden' }, 403);
    if (!deps.registrationSettings) return c.json({ error: 'Not found' }, 404);
    const parsed = RegistrationSettingsSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const actor = context.subject
      ? `${context.subject.issuer}|${context.subject.subject}`
      : 'unknown';
    return c.json(
      await deps.registrationSettings.update(context, parsed.data, actor),
    );
  });
}
