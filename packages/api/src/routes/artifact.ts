import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import { queueArtifactJob } from '@racepilot/core';

export function registerArtifactRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolveMemberContext } = context;
  app.post(
    '/admin/events/:eventId/registration-groups/:groupId/confirmation',
    async (c) => {
      const context = await resolveMemberContext(c.req.raw);
      if (!context) return c.json({ error: 'Unauthorized' }, 401);
      if (!context.permissions.has('entry:read'))
        return c.json({ error: 'Forbidden' }, 403);
      const eventId = c.req.param('eventId');
      const groupId = c.req.param('groupId');
      if (
        !z.string().uuid().safeParse(eventId).success ||
        !z.string().uuid().safeParse(groupId).success
      )
        return c.json({ error: 'Not found' }, 404);
      if (!deps.entryConfirmations || !deps.artifactJobs || !deps.objectStorage)
        return c.json({ error: 'Not found' }, 404);
      const data = await deps.entryConfirmations.getByGroup(
        context,
        eventId,
        groupId,
      );
      if (!data) return c.json({ error: 'Not found' }, 404);
      const keyHeader = c.req.header('Idempotency-Key');
      if (!keyHeader || !/^[\x21-\x7e]{1,200}$/.test(keyHeader))
        return c.json({ error: 'Idempotency-Key required' }, 400);
      const idempotencyKey = `confirmation:${eventId}:${groupId}:${keyHeader}`;
      const result = await queueArtifactJob(context, deps.artifactJobs, {
        eventId,
        kind: 'confirmation_pdf',
        registrationGroupId: groupId,
        idempotencyKey,
      });
      if (!result.ok) {
        switch (result.error) {
          case 'idempotency-conflict':
            return c.json({ error: 'Idempotency-Key conflict' }, 409);
          default: {
            const exhaustive: never = result.error;
            return exhaustive;
          }
        }
      }
      c.header('Cache-Control', 'private, no-store');
      c.header('Location', `/admin/artifact-jobs/${result.job.id}`);
      return c.json({ jobId: result.job.id, status: result.job.status }, 202);
    },
  );
  app.get(
    '/admin/events/:eventId/registration-form-uploads/:objectId',
    async (c) => {
      const context = await resolveMemberContext(c.req.raw);
      if (!context) return c.json({ error: 'Unauthorized' }, 401);
      if (!context.permissions.has('entry:read'))
        return c.json({ error: 'Forbidden' }, 403);
      const eventId = c.req.param('eventId');
      const objectId = c.req.param('objectId');
      if (
        !z.string().uuid().safeParse(eventId).success ||
        !z.string().uuid().safeParse(objectId).success ||
        !deps.objectStorage ||
        !deps.publicRegistration?.canDownloadCustomFieldUpload
      )
        return c.json({ error: 'Not found' }, 404);
      try {
        if (
          !(await deps.publicRegistration.canDownloadCustomFieldUpload(
            context,
            eventId,
            objectId,
          ))
        )
          return c.json({ error: 'Not found' }, 404);
        const stored = await deps.objectStorage.get(
          context.organizationId,
          objectId,
        );
        if (!stored || stored.ref.organizationId !== context.organizationId)
          return c.json({ error: 'Not found' }, 404);
        c.header('Cache-Control', 'private, no-store');
        c.header('Content-Type', 'application/octet-stream');
        c.header(
          'Content-Disposition',
          `attachment; filename="registration-upload-${objectId}"`,
        );
        c.header('X-Content-Type-Options', 'nosniff');
        return c.body(new Blob([Buffer.from(stored.body)]));
      } catch {
        return c.json({ error: 'Not found' }, 404);
      }
    },
  );
}
