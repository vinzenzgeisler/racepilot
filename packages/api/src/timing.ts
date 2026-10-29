import { z } from 'zod';
import {
  calculateTimingResults,
  type TimingCompetitor,
  type RequestContext,
} from '@racepilot/core';
import type {
  TimingRepository,
  TimingMeasurementInput,
} from '@racepilot/adapter-postgres';
import type { ModuleRouter } from './modules.js';
import { TimingConfigSchema } from './timing-module.js';

const MeasurementSchema = z
  .object({
    entryId: z.string().uuid().optional(),
    startNumber: z.string().trim().min(1).max(32).optional(),
    run: z.number().int().min(1),
    timeMs: z.number().int().positive(),
    penaltyMs: z.number().int().min(0).default(0),
    exclusion: z.enum(['DNF', 'DNS', 'DSQ']).optional(),
    source: z.string().trim().min(1).max(200).default('manual'),
    recordedAt: z
      .string()
      .datetime({ offset: true })
      .default(() => new Date().toISOString()),
  })
  .strict()
  .refine(
    (x) => Boolean(x.entryId) !== Boolean(x.startNumber),
    'Supply exactly one of entryId or startNumber',
  );
const CsvRequest = z
  .object({ csv: z.string().min(1).max(2_000_000), dryRun: z.boolean() })
  .strict();
const CorrectionSchema = z
  .object({
    entryId: z.string().uuid().optional(),
    startNumber: z.string().trim().min(1).max(32).optional(),
    run: z.number().int().min(1).optional(),
    timeMs: z.number().int().positive().optional(),
    penaltyMs: z.number().int().min(0).optional(),
    exclusion: z.enum(['DNF', 'DNS', 'DSQ']).nullable().optional(),
    source: z.string().trim().min(1).max(200).optional(),
    recordedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (x) =>
      Boolean(x.entryId) !== Boolean(x.startNumber) ||
      (!x.entryId && !x.startNumber),
    'Supply at most one entry selector',
  )
  .refine(
    (x) =>
      ['run', 'timeMs', 'penaltyMs', 'exclusion', 'source', 'recordedAt'].some(
        (key) => Object.hasOwn(x, key),
      ),
    'Correction cannot be empty',
  );
const splitCSV = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
};
export const safeCSVCell = (value: unknown) => {
  let text = String(value ?? '');
  // Spreadsheet engines may interpret leading controls/whitespace before a formula.
  // eslint-disable-next-line no-control-regex
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
};
const actor = (ctx: RequestContext) =>
  ctx.subject ? `${ctx.subject.issuer}|${ctx.subject.subject}` : 'unknown';

export function installTimingRoutes(
  router: ModuleRouter,
  repository: TimingRepository,
) {
  router.post('/measurements', async (c) => {
    const parsed = MeasurementSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json(
        { error: 'Invalid measurement', issues: parsed.error.issues },
        400,
      );
    const module = c.get('module');
    const config = TimingConfigSchema.safeParse(module.config);
    if (!config.success)
      return c.json({ error: 'Timing configuration is invalid' }, 409);
    const value = parsed.data;
    if (value.run > config.data.runStructure.runCount)
      return c.json({ error: 'Run exceeds configured run count' }, 400);
    const entry = await repository.resolveEntry(
      module.context,
      module.eventId,
      value.entryId
        ? { entryId: value.entryId }
        : { startNumber: value.startNumber! },
    );
    if (!entry) return c.json({ error: 'Entry not found' }, 404);
    const input: TimingMeasurementInput = {
      entryId: entry.entryId,
      run: value.run,
      timeMs: value.timeMs,
      penaltyMs: value.penaltyMs,
      ...(value.exclusion ? { exclusion: value.exclusion } : {}),
      source: value.source,
      recordedAt: value.recordedAt,
    };
    try {
      const saved = await repository.record(
        module.context,
        module.eventId,
        input,
        actor(module.context),
      );
      return saved
        ? c.json(saved, 201)
        : c.json({ error: 'Entry not found' }, 404);
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : 'Recording failed' },
        409,
      );
    }
  });

  router.post('/measurements/csv', async (c) => {
    const body = CsvRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'Invalid CSV request' }, 400);
    let rows: string[][];
    try {
      rows = splitCSV(body.data.csv);
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : 'Malformed CSV' },
        400,
      );
    }
    if (rows.length < 2)
      return c.json({ error: 'CSV needs a header and at least one row' }, 400);
    const header = rows[0]!.map((v) => v.trim());
    if (new Set(header).size !== header.length)
      return c.json({ error: 'Duplicate CSV header' }, 400);
    const index = (key: string) => header.indexOf(key);
    const required = ['run', 'timeMs', 'source', 'recordedAt'];
    if (
      (!header.includes('entryId') && !header.includes('startNumber')) ||
      required.some((k) => index(k) < 0)
    )
      return c.json(
        {
          error:
            'CSV header must include entryId or startNumber, run, timeMs, source, recordedAt',
        },
        400,
      );
    const errors: { row: number; message: string }[] = [];
    const planned: TimingMeasurementInput[] = [];
    const seen = new Set<string>();
    const module = c.get('module');
    const config = TimingConfigSchema.safeParse(module.config);
    if (!config.success)
      return c.json({ error: 'Timing configuration is invalid' }, 409);
    const existing = await repository.list(module.context, module.eventId);
    const active = new Set(
      existing.filter((m) => m.active).map((m) => `${m.entryId}:${m.run}`),
    );
    for (let i = 1; i < rows.length; i++) {
      const values = rows[i]!;
      if (values.every((v) => !v.trim())) continue;
      if (values.length !== header.length) {
        errors.push({
          row: i + 1,
          message: 'CSV column count does not match header',
        });
        continue;
      }
      const get = (key: string) =>
        index(key) >= 0 ? (values[index(key)!] ?? '') : '';
      const number = get('startNumber');
      const id = get('entryId');
      const input = MeasurementSchema.safeParse({
        ...(id ? { entryId: id } : {}),
        ...(number ? { startNumber: number } : {}),
        run: Number(get('run')),
        timeMs: Number(get('timeMs')),
        penaltyMs: index('penaltyMs') >= 0 ? Number(get('penaltyMs')) : 0,
        ...(get('exclusion') ? { exclusion: get('exclusion') } : {}),
        source: get('source'),
        recordedAt: get('recordedAt'),
      });
      if (!input.success) {
        errors.push({
          row: i + 1,
          message: input.error.issues.map((x) => x.message).join('; '),
        });
        continue;
      }
      const entry = await repository.resolveEntry(
        module.context,
        module.eventId,
        id ? { entryId: id } : { startNumber: number! },
      );
      if (!entry) {
        errors.push({ row: i + 1, message: 'Entry not found' });
        continue;
      }
      if (input.data.run > config.data.runStructure.runCount) {
        errors.push({
          row: i + 1,
          message: 'Run exceeds configured run count',
        });
        continue;
      }
      const key = `${entry.entryId}:${input.data.run}`;
      if (seen.has(key) || active.has(key)) {
        errors.push({ row: i + 1, message: 'Duplicate timing run' });
        continue;
      }
      seen.add(key);
      planned.push({
        entryId: entry.entryId,
        run: input.data.run,
        timeMs: input.data.timeMs,
        penaltyMs: input.data.penaltyMs,
        ...(input.data.exclusion ? { exclusion: input.data.exclusion } : {}),
        source: input.data.source,
        recordedAt: input.data.recordedAt,
      });
    }
    if (rows.length - 1 === 0)
      errors.push({ row: 1, message: 'No measurement rows' });
    const report = {
      dryRun: body.data.dryRun,
      accepted: planned.length,
      errors,
    };
    if (body.data.dryRun) return c.json(report);
    if (errors.length)
      return c.json(
        { ...report, error: 'CSV contains invalid rows; nothing imported' },
        400,
      );
    let saved: Awaited<ReturnType<typeof repository.recordMany>>;
    try {
      saved = await repository.recordMany(
        module.context,
        module.eventId,
        planned,
        actor(module.context),
      );
    } catch (e) {
      return c.json(
        {
          error: e instanceof Error ? e.message : 'CSV import failed',
          imported: 0,
        },
        409,
      );
    }
    if (saved.length !== planned.length)
      return c.json({ error: 'Entry not found', imported: 0 }, 404);
    return c.json(
      { dryRun: false, imported: saved.length, measurements: saved },
      201,
    );
  });

  router.get('/measurements', async (c) => {
    const m = c.get('module');
    return c.json({
      measurements: await repository.list(m.context, m.eventId),
    });
  });
  router.post('/measurements/:measurementId/corrections', async (c) => {
    const parsed = CorrectionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json(
        { error: 'Invalid correction', issues: parsed.error.issues },
        400,
      );
    const m = c.get('module');
    const config = TimingConfigSchema.safeParse(m.config);
    if (!config.success)
      return c.json({ error: 'Timing configuration is invalid' }, 409);
    const patch = parsed.data;
    if (
      patch.run !== undefined &&
      patch.run > config.data.runStructure.runCount
    )
      return c.json({ error: 'Run exceeds configured run count' }, 400);
    let entryId = patch.entryId;
    if (patch.startNumber) {
      const entry = await repository.resolveEntry(m.context, m.eventId, {
        startNumber: patch.startNumber,
      });
      if (!entry) return c.json({ error: 'Entry not found' }, 404);
      entryId = entry.entryId;
    }
    const fields = { ...patch };
    delete fields.startNumber;
    try {
      const result = await repository.correct(
        m.context,
        m.eventId,
        c.req.param('measurementId'),
        {
          ...Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
          ),
          ...(entryId ? { entryId } : {}),
        },
        actor(m.context),
      );
      return result
        ? c.json(result, 201)
        : c.json({ error: 'Measurement not found' }, 404);
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : 'Correction failed' },
        409,
      );
    }
  });

  router.post('/results/drafts', async (c) => {
    const m = c.get('module');
    const parsed = TimingConfigSchema.safeParse(m.config);
    if (!parsed.success)
      return c.json({ error: 'Timing configuration is invalid' }, 409);
    const active = (await repository.list(m.context, m.eventId)).filter(
      (x) => x.active,
    );
    const byEntry = new Map<string, TimingCompetitor>();
    for (const entry of await repository.listEntries(m.context, m.eventId)) {
      if (
        !entry.statusCategory ||
        !parsed.data.eligibleEntryCategories.some(
          (category) => category === entry.statusCategory,
        )
      )
        continue;
      byEntry.set(entry.entryId, {
        entryId: entry.entryId,
        startNumber: entry.startNumber,
        runs: [],
      });
    }
    for (const item of active) {
      const competitor = byEntry.get(item.entryId);
      if (!competitor) continue;
      const updated = {
        ...competitor,
        runs: [
          ...competitor.runs,
          {
            run: item.run,
            timeMs: item.timeMs,
            penaltyMs: item.penaltyMs ?? 0,
            ...(item.exclusion ? { exclusion: item.exclusion } : {}),
          },
        ],
      };
      byEntry.set(item.entryId, updated);
    }
    const scoringRule = parsed.data.scoringRule;
    const completionPolicy =
      scoringRule.completionPolicy ??
      (scoringRule.method === 'fastest-run' ? 'available-runs' : 'all-runs');
    const rule = {
      ...scoringRule,
      completionPolicy,
      runCount: parsed.data.runStructure.runCount,
    };
    if (active.some((measurement) => measurement.run > rule.runCount))
      return c.json(
        { error: 'Configured run count is lower than existing measurements' },
        409,
      );
    const results = calculateTimingResults(
      [...byEntry.values()].map((competitor) =>
        competitor.runs.length === 0
          ? { ...competitor, exclusion: parsed.data.zeroRunStatus }
          : competitor.runs.length < rule.runCount &&
              completionPolicy === 'all-runs'
            ? { ...competitor, exclusion: parsed.data.incompleteRunStatus }
            : competitor,
      ),
      rule,
    );
    const draft = await repository.createDraft(
      m.context,
      m.eventId,
      rule,
      results,
      actor(m.context),
    );
    return draft
      ? c.json(draft, 201)
      : c.json({ error: 'Event not found' }, 404);
  });
  router.post('/results/:version/publish', async (c) => {
    const version = Number(c.req.param('version'));
    if (!Number.isSafeInteger(version) || version < 1)
      return c.json({ error: 'Invalid result version' }, 400);
    const m = c.get('module');
    const published = await repository.publish(
      m.context,
      m.eventId,
      version,
      actor(m.context),
    );
    return published
      ? c.json(published)
      : c.json({ error: 'Draft not found' }, 404);
  });
  router.get('/results', async (c) => {
    const m = c.get('module');
    const published = await repository.latestPublished(m.context, m.eventId);
    return published
      ? c.json(published)
      : c.json({ error: 'No published results' }, 404);
  });
  router.get('/published-public', async (c) => {
    const m = c.get('module');
    const published = await repository.latestPublished(m.context, m.eventId);
    return published
      ? c.json(published)
      : c.json({ error: 'No published results' }, 404);
  });
  router.get('/results.csv', async (c) => {
    const m = c.get('module');
    const published = await repository.latestPublished(m.context, m.eventId);
    if (!published) return c.json({ error: 'No published results' }, 404);
    const results = Array.isArray(published.results)
      ? (published.results as Record<string, unknown>[])
      : [];
    const lines = [
      ['rank', 'startNumber', 'entryId', 'status', 'scoreMs', 'completedRuns']
        .map(safeCSVCell)
        .join(','),
      ...results.map((row) =>
        ['rank', 'startNumber', 'entryId', 'status', 'scoreMs', 'completedRuns']
          .map((k) => safeCSVCell(row[k]))
          .join(','),
      ),
    ];
    return c.text(lines.join('\r\n'), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="timing-results.csv"',
    });
  });
}
