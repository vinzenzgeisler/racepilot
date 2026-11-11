import type { Context } from 'hono';
import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import {
  entryExportFields,
  queueArtifactJob,
  type EntryExportField,
  type EntryExportFilters,
} from '@racepilot/core';

const EXPORT_HISTORY_LIMIT = 20;

export function registerEntryExportRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolveMemberContext } = context;
  const enqueueEntryExport = async (c: Context) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const parsedEventId = z.string().uuid().safeParse(c.req.param('eventId'));
    if (!parsedEventId.success) return c.json({ error: 'Not found' }, 404);
    const eventId = parsedEventId.data;
    const event = await deps.events.getById(context, eventId);
    if (
      !event ||
      !deps.entryExports ||
      !deps.artifactJobs ||
      !deps.objectStorage
    )
      return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({
        fields: z.string().optional(),
        classId: z.string().uuid().optional(),
        acceptanceStatus: z
          .string()
          .regex(/^[a-z][a-z0-9_-]{0,63}$/)
          .optional(),
        verificationStatus: z.enum(['unverified', 'verified']).optional(),
        paymentStatus: z
          .enum([
            'open',
            'partially_paid',
            'paid',
            'not_required',
            'not_relevant',
          ])
          .optional(),
        search: z.string().trim().max(120).optional(),
        delimiter: z.enum([',', ';']).default(';'),
      })
      .strict()
      .safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!parsed.success)
      return c.json({ error: 'Invalid export filters' }, 400);
    const requestedFields = parsed.data.fields?.split(',') ?? [
      ...entryExportFields,
    ];
    const fields = requestedFields.filter((field): field is EntryExportField =>
      entryExportFields.some((candidate) => candidate === field),
    );
    if (fields.length === 0 || fields.length !== requestedFields.length)
      return c.json({ error: 'Invalid export fields' }, 400);
    const key = c.req.header('Idempotency-Key');
    if (!key || !/^[\x21-\x7e]{1,200}$/.test(key))
      return c.json({ error: 'Idempotency-Key required' }, 400);
    const filters: EntryExportFilters = {
      ...(parsed.data.classId ? { classId: parsed.data.classId } : {}),
      ...(parsed.data.acceptanceStatus
        ? { acceptanceStatus: parsed.data.acceptanceStatus }
        : {}),
      ...(parsed.data.verificationStatus
        ? { verificationStatus: parsed.data.verificationStatus }
        : {}),
      ...(parsed.data.paymentStatus
        ? { paymentStatus: parsed.data.paymentStatus }
        : {}),
      ...(parsed.data.search ? { search: parsed.data.search } : {}),
    };
    const result = await queueArtifactJob(context, deps.artifactJobs, {
      eventId,
      kind: 'entries_csv',
      fields,
      filters,
      delimiter: parsed.data.delimiter,
      idempotencyKey: `entries-csv:${eventId}:${key}`,
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
    return c.json({ jobId: result.job.id, status: 'running' }, 202);
  };
  app.get('/admin/events/:eventId/entries.csv', enqueueEntryExport);
  app.post('/admin/events/:eventId/entries.csv', enqueueEntryExport);
  app.get('/admin/events/:eventId/exports', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const eventId = c.req.param('eventId');
    if (
      !z.string().uuid().safeParse(eventId).success ||
      !deps.artifactJobs ||
      !deps.events
    )
      return c.json({ error: 'Not found' }, 404);
    if (!(await deps.events.getById(context, eventId)))
      return c.json({ error: 'Not found' }, 404);
    const jobs = await deps.artifactJobs.listByEvent(
      context,
      eventId,
      'entries_csv',
      EXPORT_HISTORY_LIMIT,
    );
    const now = Date.now();
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      jobs
        .filter((job) => job.kind === 'entries_csv')
        .map((job) => ({
          jobId: job.id,
          status:
            job.expiresAt && Date.parse(job.expiresAt) <= now
              ? 'expired'
              : job.status === 'queued' || job.status === 'processing'
                ? 'running'
                : job.status === 'ready'
                  ? 'finished'
                  : 'failed',
          createdAt: job.createdAt,
          expiresAt: job.expiresAt,
          fields: job.fields,
          filters: job.filters,
          downloadUrl:
            job.status === 'ready' &&
            (!job.expiresAt || Date.parse(job.expiresAt) > now)
              ? `/admin/artifact-jobs/${job.id}/download`
              : null,
        })),
    );
  });
  app.get('/admin/artifact-jobs/:jobId/status', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const id = c.req.param('jobId');
    if (!z.string().uuid().safeParse(id).success || !deps.artifactJobs)
      return c.json({ error: 'Not found' }, 404);
    const job = await deps.artifactJobs.getById(context, id);
    if (!job) return c.json({ error: 'Not found' }, 404);
    const now = Date.now();
    const status =
      job.status === 'ready' &&
      job.expiresAt &&
      Date.parse(job.expiresAt) <= now
        ? 'expired'
        : job.status === 'queued' || job.status === 'processing'
          ? 'running'
          : job.status === 'ready'
            ? 'finished'
            : 'failed';
    c.header('Cache-Control', 'private, no-store');
    return c.json({
      jobId: job.id,
      status,
      error: job.error,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
    });
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
    if (
      job.status === 'ready' &&
      job.expiresAt &&
      Date.parse(job.expiresAt) <= Date.now()
    )
      return c.json({ jobId: job.id, status: 'expired' }, 410);
    if (job.status !== 'ready') {
      const status = job.status === 'failed' ? 'failed' : 'running';
      return c.json(
        { jobId: job.id, status, error: job.error },
        job.status === 'failed' ? 422 : 202,
      );
    }
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
  app.get('/admin/artifact-jobs/:jobId/download', async (c) => {
    const context = await resolveMemberContext(c.req.raw);
    if (!context) return c.json({ error: 'Unauthorized' }, 401);
    if (!context.permissions.has('entry:read'))
      return c.json({ error: 'Forbidden' }, 403);
    const id = c.req.param('jobId');
    if (!z.string().uuid().safeParse(id).success || !deps.artifactJobs)
      return c.json({ error: 'Not found' }, 404);
    const job = await deps.artifactJobs.getById(context, id);
    if (!job) return c.json({ error: 'Not found' }, 404);
    if (
      job.status === 'ready' &&
      job.expiresAt &&
      Date.parse(job.expiresAt) <= Date.now()
    )
      return c.json({ error: 'Export expired' }, 410);
    if (job.status !== 'ready')
      return c.json({ error: 'Export not ready' }, 409);
    c.header('Cache-Control', 'private, no-store');
    return c.redirect(`/admin/artifact-jobs/${job.id}`, 302);
  });
}
