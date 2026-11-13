import type {
  ApiRoutesContext,
  PublicRegistrationRouteDeps,
} from './context.js';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { validateRegistrationImage } from '../registration-assets.js';
import { resolveRegistrationRateLimits } from '../rate-limit.js';
import { getPublicEvent, type ObjectStorageProvider } from '@racepilot/core';
import type { PublicRegistrationService } from '../services.js';
import {
  standardRegistrationForm,
  RegistrationFormConfigPatchSchema,
  defaultRegistrationFormConfig,
  mergeRegistrationFormConfig,
} from '@racepilot/contracts';

/** The public registration form with consents and the organization's form configuration. */
export function registerPublicFormRoute(
  { app, resolvePublicContext }: ApiRoutesContext,
  service: PublicRegistrationService,
): void {
  app.get(
    '/public/organizations/:organizationId/events/:slug/registration/form',
    async (c) => {
      const orgId = c.req.param('organizationId');
      const context = await resolvePublicContext(c.req.raw);
      if (
        !context ||
        orgId !== context.organizationId ||
        !z.string().uuid().safeParse(orgId).success
      )
        return c.json({ error: 'Not found' }, 404);
      const result = await service.getForm(context, c.req.param('slug'));
      return result
        ? c.json({
            form: standardRegistrationForm,
            ...(result as object),
            registrationFormConfig: mergeRegistrationFormConfig(
              defaultRegistrationFormConfig,
              RegistrationFormConfigPatchSchema.parse(
                (result as Record<string, unknown>).registrationFormConfig ??
                  {},
              ),
            ),
          })
        : c.json({ error: 'Not found' }, 404);
    },
  );
}

/** Without public registration only the event itself is shown, with the standard form. */
export function registerPublicEventFormRoute({
  app,
  deps,
  resolvePublicContext,
}: ApiRoutesContext): void {
  app.get(
    '/public/organizations/:organizationId/events/:slug/registration/form',
    async (c) => {
      const orgId = c.req.param('organizationId');
      const context = await resolvePublicContext(c.req.raw);
      if (
        !context ||
        orgId !== context.organizationId ||
        !z.string().uuid().safeParse(orgId).success
      )
        return c.json({ error: 'Not found' }, 404);
      const event = await getPublicEvent(
        context,
        c.req.param('slug'),
        new Date(),
        { events: deps.events },
      );
      return event
        ? c.json({
            form: standardRegistrationForm,
            event,
            consents: [],
            registrationFormConfig: defaultRegistrationFormConfig,
          })
        : c.json({ error: 'Not found' }, 404);
    },
  );
}

/** Uploads into custom file fields of the registration form; needs storage and registration. */
export function registerCustomFieldUploadRoute(
  { app, deps, resolvePublicContext }: ApiRoutesContext,
  registration: PublicRegistrationRouteDeps,
  storage: ObjectStorageProvider,
): void {
  const {
    service,
    consumeRegistrationBudget,
    setRetryAfter,
    rateLimitDefaults,
  } = registration;
  app.post(
    '/public/organizations/:organizationId/events/:slug/registration/custom-fields/:fieldKey/upload',
    async (c) => {
      const context = await resolvePublicContext(c.req.raw);
      const organizationParam = c.req.param('organizationId');
      const eventSlug = c.req.param('slug');
      const fieldKey = c.req.param('fieldKey');
      if (
        !context ||
        organizationParam !== context.organizationId ||
        !/^[a-z][a-z0-9_-]{0,39}$/.test(fieldKey)
      )
        return c.json({ error: 'Registration unavailable' }, 404);
      let configured;
      try {
        configured = await deps.publicRegistrationRateLimits.resolvePublicEvent(
          context,
          eventSlug,
        );
      } catch {
        return c.json({ error: 'Registration unavailable' }, 503);
      }
      if (!configured)
        return c.json({ error: 'Registration unavailable' }, 404);
      const limits = resolveRegistrationRateLimits(
        rateLimitDefaults,
        configured.organization,
        configured.event,
      );
      const budget = await consumeRegistrationBudget(c, [
        { key: `organization:${organizationParam}`, ...limits.organization },
        {
          key: `event:${organizationParam}:${configured.eventId}`,
          ...limits.event,
        },
      ]);
      if (budget.unavailable)
        return c.json({ error: 'Registration unavailable' }, 503);
      if (!budget.allowed) {
        setRetryAfter(c, budget.retryAfterMs);
        return c.json({ error: 'Registration unavailable' }, 429);
      }
      const form = await service.getForm(context, eventSlug).catch(() => null);
      if (!form) return c.json({ error: 'Registration unavailable' }, 404);
      const config = RegistrationFormConfigPatchSchema.safeParse(
        (form as Record<string, unknown>).registrationFormConfig ?? {},
      );
      if (
        !config.success ||
        !config.data.customFields?.some(
          (field) => field.key === fieldKey && field.type === 'file',
        )
      )
        return c.json({ error: 'Registration unavailable' }, 404);
      const multipart = await c.req.formData().catch(() => null);
      const file = multipart?.get('file');
      if (!(file instanceof File) || file.size === 0 || file.size > 6_000_000)
        return c.json({ error: 'Invalid file' }, 400);
      let safeFile: { body: Uint8Array; contentType: string };
      try {
        safeFile = validateRegistrationImage(
          'headerImage',
          new Uint8Array(await file.arrayBuffer()),
          file.type,
        );
      } catch {
        return c.json({ error: 'Unsupported or unsafe file' }, 400);
      }
      const uploadToken = randomBytes(32).toString('base64url');
      const uploadTokenHash = createHash('sha256')
        .update(uploadToken)
        .digest('hex');
      let stored;
      try {
        stored = await storage.put({
          organizationId: context.organizationId,
          body: safeFile.body,
          contentType: safeFile.contentType,
        });
        if (!z.string().uuid().safeParse(stored.objectId).success)
          throw new Error('Invalid object id');
        const registered = await service.registerCustomFieldUpload(
          context,
          eventSlug,
          fieldKey,
          stored.objectId,
          uploadTokenHash,
        );
        if (!registered) {
          await storage.delete(context.organizationId, stored.objectId);
          return c.json({ error: 'Registration unavailable' }, 400);
        }
        c.header('Cache-Control', 'no-store');
        return c.json({ objectId: stored.objectId, uploadToken }, 201);
      } catch {
        if (stored)
          await storage
            .delete(context.organizationId, stored.objectId)
            .catch(() => undefined);
        return c.json({ error: 'Registration unavailable' }, 503);
      }
    },
  );
}
