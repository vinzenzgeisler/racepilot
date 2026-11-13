import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import { queueArtifactJob, type ObjectStorageProvider } from '@racepilot/core';
import type { PublicRegistrationService } from '../services.js';

/** Queues confirmation PDFs; registered only with storage, where the worker writes them. */
export function registerConfirmationRoutes(context: ApiRoutesContext): void {
  const { app, deps, requireMember } = context;
  app.post(
    '/admin/events/:eventId/registration-groups/:groupId/confirmation',
    async (c) => {
      const guard = await requireMember(c.req.raw, 'entry:read');
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const context = guard.context;
      const eventId = c.req.param('eventId');
      const groupId = c.req.param('groupId');
      if (
        !z.string().uuid().safeParse(eventId).success ||
        !z.string().uuid().safeParse(groupId).success
      )
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
}

/** Downloads of files that participants uploaded into custom registration fields. */
export function registerFormUploadRoutes(
  context: ApiRoutesContext,
  storage: ObjectStorageProvider,
  publicRegistration: PublicRegistrationService,
): void {
  const { app, requireMember } = context;
  app.get(
    '/admin/events/:eventId/registration-form-uploads/:objectId',
    async (c) => {
      const guard = await requireMember(c.req.raw, 'entry:read');
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const context = guard.context;
      const eventId = c.req.param('eventId');
      const objectId = c.req.param('objectId');
      if (
        !z.string().uuid().safeParse(eventId).success ||
        !z.string().uuid().safeParse(objectId).success
      )
        return c.json({ error: 'Not found' }, 404);
      try {
        if (
          !(await publicRegistration.canDownloadCustomFieldUpload(
            context,
            eventId,
            objectId,
          ))
        )
          return c.json({ error: 'Not found' }, 404);
        const stored = await storage.get(context.organizationId, objectId);
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
