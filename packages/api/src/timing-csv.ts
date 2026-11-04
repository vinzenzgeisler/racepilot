import type { ModuleRouter } from './modules.js';
import type {
  TimingRepository,
  TimingMeasurementInput,
} from '@racepilot/adapter-postgres';
import { TimingConfigSchema } from './timing-module.js';
import {
  MeasurementSchema,
  CsvRequest,
  splitCSV,
  actor,
} from './timing-shared.js';

export function installTimingCsvRoute(
  router: ModuleRouter,
  repository: TimingRepository,
) {
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
}
