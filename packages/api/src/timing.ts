import { calculateTimingResults, type TimingCompetitor } from '@racepilot/core';
import type {
  TimingRepository,
  TimingMeasurementInput,
} from '@racepilot/adapter-postgres';
import type { ModuleRouter } from './modules.js';
import { TimingConfigSchema } from './timing-module.js';
import {
  MeasurementSchema,
  CorrectionSchema,
  actor,
  safeCSVCell,
} from './timing-shared.js';
import { installTimingCsvRoute } from './timing-csv.js';
export { safeCSVCell } from './timing-shared.js';

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

  installTimingCsvRoute(router, repository);

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
