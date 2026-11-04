import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import { entryExportFields } from '@racepilot/core';

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
      const job = await deps.artifactJobs.enqueue(context, {
        eventId,
        kind: 'confirmation_pdf',
        registrationGroupId: groupId,
        idempotencyKey,
      });
      c.header('Cache-Control', 'private, no-store');
      c.header('Location', `/admin/artifact-jobs/${job.id}`);
      return c.json({ jobId: job.id, status: job.status }, 202);
    },
  );
  app.get('/admin/events/:eventId/entries.csv', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const eventId = c.req.param('eventId');
    if (!z.string().uuid().safeParse(eventId).success)
      return c.json({ error: 'Not found' }, 404);
    const event = await deps.events.getById(context, eventId);
    if (
      !event ||
      !deps.entryExports ||
      !deps.artifactJobs ||
      !deps.objectStorage
    )
      return c.json({ error: 'Not found' }, 404);
    const requested = c.req.query('fields')?.split(',') ?? [
      ...entryExportFields,
    ];
    if (
      requested.length === 0 ||
      requested.some(
        (field) =>
          !entryExportFields.includes(
            field as (typeof entryExportFields)[number],
          ),
      )
    )
      return c.json({ error: 'Invalid export fields' }, 400);
    const keyHeader = c.req.header('Idempotency-Key');
    if (!keyHeader || !/^[\x21-\x7e]{1,200}$/.test(keyHeader))
      return c.json({ error: 'Idempotency-Key required' }, 400);
    const requestKey = keyHeader;
    const job = await deps.artifactJobs.enqueue(context, {
      eventId,
      kind: 'entries_csv',
      fields: requested,
      idempotencyKey: `entries-csv:${eventId}:${requestKey}`,
    });
    c.header('Cache-Control', 'private, no-store');
    c.header('Location', `/admin/artifact-jobs/${job.id}`);
    return c.json({ jobId: job.id, status: job.status }, 202);
  });
  app.get('/admin/artifact-jobs/:jobId', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const id = c.req.param('jobId');
    if (
      !z.string().uuid().safeParse(id).success ||
      !deps.artifactJobs ||
      !deps.objectStorage
    )
      return c.json({ error: 'Not found' }, 404);
    const job = await deps.artifactJobs.getById(context, id);
    if (!job) return c.json({ error: 'Not found' }, 404);
    c.header('Cache-Control', 'private, no-store');
    if (job.status !== 'ready')
      return c.json(
        { jobId: job.id, status: job.status, error: job.error },
        job.status === 'failed' ? 422 : 202,
      );
    if (!job.objectId || !job.sha256 || !job.contentType)
      return c.json({ error: 'Not found' }, 404);
    const stored = await deps.objectStorage.get(
      context.organizationId,
      job.objectId,
    );
    if (
      !stored ||
      stored.ref.organizationId !== context.organizationId ||
      stored.ref.sha256 !== job.sha256 ||
      stored.ref.contentType !== job.contentType
    )
      return c.json({ error: 'Not found' }, 404);
    c.header('Content-Type', job.contentType);
    c.header(
      'Content-Disposition',
      `attachment; filename="${job.kind === 'entries_csv' ? `entries-${job.eventId}.csv` : `entry-confirmation-${job.id}.pdf`}"`,
    );
    return c.body(new Blob([Buffer.from(stored.body)]));
  });
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
