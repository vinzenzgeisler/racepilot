import { describe, expect, it } from 'vitest';
import {
  createRequestContext,
  createInMemoryModuleActivationRepository,
  createModuleRegistry,
  organizationId,
} from '@racepilot/core';
import type {
  TimingRepository,
  TimingMeasurementRecord,
  TimingResultVersion,
} from '@racepilot/adapter-postgres';
import { createApp } from './index.js';
import { ModuleManifestSchema } from '@racepilot/contracts';
import type { ModuleApiDeps } from './modules.js';
import {
  timingModule,
  defaultTimingConfig,
  TimingConfigSchema,
} from './timing-module.js';
import { installTimingRoutes, safeCSVCell } from './timing.js';

const org = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const event = '20000000-0000-4000-8000-000000000001';
const ids = [
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
];
const names = ['1', '2', '3'];
function build() {
  const activation = createInMemoryModuleActivationRepository(
    (ctx, id) => ctx.organizationId === org && id === event,
  );
  const measurements: TimingMeasurementRecord[] = [];
  const versions: TimingResultVersion[] = [];
  const entries = new Map(ids.map((id, i) => [id, names[i]!]));
  const entryCategories = new Map(ids.map((id) => [id, 'accepted']));
  let next = 1;
  const repo: TimingRepository = {
    listEntries: async (ctx, eventId) =>
      ctx.organizationId === org && eventId === event
        ? ids.map((entryId, i) => ({
            entryId,
            startNumber: names[i]!,
            statusCategory: entryCategories.get(entryId) ?? null,
          }))
        : [],
    resolveEntry: async (_ctx, _event, lookup) => {
      const found = lookup.entryId
        ? entries.get(lookup.entryId)
        : names.find((x) => x === lookup.startNumber);
      if (!found) return null;
      const entryId = lookup.entryId ?? ids[names.indexOf(found)]!;
      return { entryId, startNumber: found };
    },
    record: async (ctx, eventId, input, actor) => {
      if (
        ctx.organizationId !== org ||
        eventId !== event ||
        !entries.has(input.entryId)
      )
        return null;
      if (
        measurements.some(
          (m) => m.active && m.entryId === input.entryId && m.run === input.run,
        )
      )
        throw new Error('Duplicate timing run');
      const row: TimingMeasurementRecord = {
        ...input,
        id: `measurement-${next++}`,
        organizationId: org,
        eventId,
        version: 1,
        supersedesId: null,
        active: true,
        recordedBy: actor,
      };
      measurements.push(row);
      return row;
    },
    recordMany: async (ctx, eventId, inputs, actor) => {
      if (
        inputs.some((x) =>
          measurements.some(
            (m) => m.active && m.entryId === x.entryId && m.run === x.run,
          ),
        )
      )
        throw new Error('Duplicate timing run');
      const inserted: TimingMeasurementRecord[] = [];
      for (const input of inputs) {
        const row = await repo.record(ctx, eventId, input, actor);
        if (!row) throw new Error('Entry not found');
        inserted.push(row);
      }
      return inserted;
    },
    list: async (ctx, eventId) =>
      ctx.organizationId === org && eventId === event ? measurements : [],
    correct: async () => null,
    createDraft: async (ctx, eventId, rule, results, actor) => {
      if (ctx.organizationId !== org || eventId !== event) return null;
      const v: TimingResultVersion = {
        eventId,
        version: versions.length + 1,
        status: 'draft',
        rule,
        results,
        actor,
        createdAt: new Date().toISOString(),
        publishedAt: null,
      };
      versions.push(v);
      return v;
    },
    publish: async (ctx, eventId, version, actor) => {
      if (ctx.organizationId !== org || eventId !== event) return null;
      const i = versions.findIndex(
        (x) => x.version === version && x.status === 'draft',
      );
      if (i < 0) return null;
      const v = {
        ...versions[i]!,
        status: 'published' as const,
        actor,
        publishedAt: new Date().toISOString(),
      };
      versions[i] = v;
      return v;
    },
    latestPublished: async (ctx, eventId) =>
      ctx.organizationId === org && eventId === event
        ? ([...versions].reverse().find((x) => x.status === 'published') ??
          null)
        : null,
  };
  const modules: ModuleApiDeps = {
    registry: createModuleRegistry([timingModule]),
    activations: activation,
    routes: { timing: (r) => installTimingRoutes(r, repo) },
    publicReads: {
      timing: (ctx, eventId) => repo.latestPublished(ctx, eventId),
    },
  };
  const context = (request: Request) => {
    const organization =
      request.headers.get('x-org') === 'a'
        ? org
        : request.headers.get('x-org') === 'b'
          ? orgB
          : null;
    if (!organization) return null;
    return createRequestContext({
      deploymentMode: 'cloud',
      organizationId: organizationId(organization),
      subject: { issuer: 'test', subject: 'admin' },
      permissions: new Set(
        (request.headers.get('x-permissions') ?? '').split(',').filter(Boolean),
      ),
      capabilities: new Set(),
      correlationId: 'test',
    });
  };
  const publicContext = createRequestContext({
    deploymentMode: 'cloud',
    organizationId: organizationId(org),
    permissions: new Set(),
    capabilities: new Set(),
    correlationId: 'public',
  });
  const app = createApp({
    config: { deploymentMode: 'cloud' },
    organizations: { getById: async () => null, update: async () => null },
    events: { listByOrganization: async () => [], getById: async () => null },
    contextResolvers: {
      public: async () => publicContext,
      member: async (r) => context(r),
    },
    modules,
  });
  return { app, activation, repo, measurements, versions, entryCategories };
}
const perms =
  'organization:read,organization:update,event:read,event:write,timing:record,timing:correct,timing:publish,timing:read';
const headers = {
  'x-org': 'a',
  'x-permissions': perms,
  'content-type': 'application/json',
};
const send = (
  app: ReturnType<typeof build>['app'],
  path: string,
  method: string,
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const activate = async (app: ReturnType<typeof build>['app']) => {
  expect(
    (
      await send(app, '/admin/organization/modules/timing', 'PATCH', {
        enabled: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await send(app, `/admin/events/${event}/modules/timing`, 'PATCH', {
        enabled: true,
      })
    ).status,
  ).toBe(200);
};

describe('timing module backend', () => {
  it('neutralizes spreadsheet formulas in exported cells', () => {
    expect(safeCSVCell(' =1+1')).toBe('"\' =1+1"');
    expect(safeCSVCell('plain text')).toBe('"plain text"');
  });
  it('has a complete official bilingual manifest and validates run/scoring config', () => {
    expect(ModuleManifestSchema.parse(timingModule.manifest)).toBeTruthy();
    expect(timingModule.manifest.gallery).toMatchObject({
      category: 'timing',
      source: 'official',
      editions: ['community', 'cloud'],
      entitlement: 'included',
    });
    expect(defaultTimingConfig.runStructure.runCount).toBeGreaterThan(0);
    expect(
      TimingConfigSchema.parse(defaultTimingConfig).eligibleEntryCategories,
    ).toEqual(['accepted']);
    expect(
      TimingConfigSchema.safeParse({
        ...defaultTimingConfig,
        scoringRule: {
          version: 1,
          method: 'sum',
          completionPolicy: 'available-runs',
        },
      }).success,
    ).toBe(false);
  });
  it('keeps an event without the module unchanged and denies all timing actions', async () => {
    const { app, measurements } = build();
    expect(
      (
        await send(
          app,
          `/admin/events/${event}/modules/timing/measurements`,
          'GET',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await send(
          app,
          `/admin/events/${event}/modules/timing/measurements`,
          'POST',
          {},
        )
      ).status,
    ).toBe(404);
    expect(measurements).toHaveLength(0);
  });
  it('rejects runs beyond configured count for manual, CSV, and correction requests', async () => {
    const { app } = build();
    await activate(app);
    const manual = await send(
      app,
      `/admin/events/${event}/modules/timing/measurements`,
      'POST',
      {
        entryId: ids[0],
        run: 4,
        timeMs: 100,
        source: 'manual',
        recordedAt: '2026-10-29T10:00:00Z',
      },
    );
    expect(manual.status).toBe(400);
    const csv = await send(
      app,
      `/admin/events/${event}/modules/timing/measurements/csv`,
      'POST',
      {
        csv: `startNumber,run,timeMs,source,recordedAt\n1,4,100,csv,2026-10-29T10:00:00Z`,
        dryRun: false,
      },
    );
    expect(csv.status).toBe(400);
    expect(await csv.json()).toMatchObject({
      accepted: 0,
      errors: [{ row: 2, message: 'Run exceeds configured run count' }],
    });
    const correction = await send(
      app,
      `/admin/events/${event}/modules/timing/measurements/measurement-id/corrections`,
      'POST',
      { run: 4 },
    );
    expect(correction.status).toBe(400);
    const noOp = await send(
      app,
      `/admin/events/${event}/modules/timing/measurements/measurement-id/corrections`,
      'POST',
      { entryId: ids[0] },
    );
    expect(noOp.status).toBe(400);
  });
  it('imports CSV and manual runs, publishes deterministic results, then versions rule changes', async () => {
    const { app, measurements } = build();
    await activate(app);
    const lines = ['startNumber,run,timeMs,source,recordedAt'];
    const times = [
      [100000, 98000, 99000],
      [90000, 110000, 105000],
      [95000, 94000, 93000],
    ];
    for (let i = 0; i < 3; i++)
      for (let run = 1; run <= 2; run++)
        lines.push(
          `${names[i]},${run},${times[i]![run - 1]},csv,2026-10-29T10:00:00.000Z`,
        );
    const dry = await send(
      app,
      `/admin/events/${event}/modules/timing/measurements/csv`,
      'POST',
      { csv: lines.join('\n'), dryRun: true },
    );
    expect(dry.status).toBe(200);
    expect(await dry.json()).toMatchObject({ accepted: 6, errors: [] });
    expect(measurements).toHaveLength(0);
    const imported = await send(
      app,
      `/admin/events/${event}/modules/timing/measurements/csv`,
      'POST',
      { csv: lines.join('\n'), dryRun: false },
    );
    expect(imported.status).toBe(201);
    for (let i = 0; i < 3; i++) {
      const response = await send(
        app,
        `/admin/events/${event}/modules/timing/measurements`,
        'POST',
        {
          entryId: ids[i],
          run: 3,
          timeMs: times[i]![2],
          source: 'manual',
          recordedAt: '2026-10-29T10:01:00.000Z',
        },
      );
      expect(response.status).toBe(201);
    }
    const duplicate = await send(
      app,
      `/admin/events/${event}/modules/timing/measurements/csv`,
      'POST',
      {
        csv: `startNumber,run,timeMs,source,recordedAt\n1,1,12,csv,2026-10-29T10:00:00.000Z`,
        dryRun: true,
      },
    );
    expect(
      ((await duplicate.json()) as { errors: { message: string }[] }).errors[0]
        ?.message,
    ).toMatch(/Duplicate/);
    const draft = await send(
      app,
      `/admin/events/${event}/modules/timing/results/drafts`,
      'POST',
      {},
    );
    expect(draft.status).toBe(201);
    const first = (await draft.json()) as {
      version: number;
      results: { startNumber: string; rank: number }[];
    };
    expect(first.results.map((x) => [x.startNumber, x.rank])).toEqual([
      ['2', 1],
      ['3', 2],
      ['1', 3],
    ]);
    expect(
      (await send(app, `/admin/events/${event}/modules/timing/results`, 'GET'))
        .status,
    ).toBe(404);
    expect(
      (
        await send(
          app,
          `/admin/events/${event}/modules/timing/results/${first.version}/publish`,
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (
        (await (
          await send(
            app,
            `/admin/events/${event}/modules/timing/results`,
            'GET',
          )
        ).json()) as { version: number }
      ).version,
    ).toBe(1);
    const changed = await send(
      app,
      `/admin/events/${event}/modules/timing`,
      'PATCH',
      {
        config: {
          version: 1,
          runStructure: { runCount: 3, label: 'Run' },
          scoringRule: { version: 1, method: 'sum' },
        },
      },
    );
    expect(changed.status).toBe(200);
    const second = await send(
      app,
      `/admin/events/${event}/modules/timing/results/drafts`,
      'POST',
      {},
    );
    expect(((await second.json()) as { version: number }).version).toBe(2);
    expect(
      (
        (await (
          await send(
            app,
            `/admin/events/${event}/modules/timing/results`,
            'GET',
          )
        ).json()) as { version: number }
      ).version,
    ).toBe(1);
    expect(
      (
        await send(
          app,
          `/admin/events/${event}/modules/timing/results/2/publish`,
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (
        (await (
          await send(
            app,
            `/admin/events/${event}/modules/timing/results`,
            'GET',
          )
        ).json()) as { version: number }
      ).version,
    ).toBe(2);
  });
  it('rejects malformed CSV, foreign events, and client capability forgery', async () => {
    const { app } = build();
    await activate(app);
    const malformed = await send(
      app,
      `/admin/events/${event}/modules/timing/measurements/csv`,
      'POST',
      {
        csv: 'startNumber,run,timeMs,source,recordedAt\n1,x,4,csv,nope',
        dryRun: true,
      },
    );
    expect(
      ((await malformed.json()) as { errors: unknown[] }).errors,
    ).toHaveLength(1);
    expect(
      (
        await send(
          app,
          '/admin/events/20000000-0000-4000-8000-000000000099/modules/timing/measurements',
          'GET',
        )
      ).status,
    ).toBe(404);
    const forged = await app.request(
      `/admin/events/${event}/modules/timing/measurements`,
      {
        method: 'POST',
        headers: {
          'x-org': 'a',
          'x-permissions': 'event:read',
          'x-capabilities': 'module.timing',
          cookie: 'capabilities=module.timing',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entryId: ids[0],
          run: 1,
          timeMs: 10,
          source: 'x',
          recordedAt: '2026-10-29T10:00:00Z',
        }),
      },
    );
    expect(forged.status).toBe(403);
    const foreignOrg = await app.request(
      `/admin/events/${event}/modules/timing/measurements`,
      { method: 'GET', headers: { 'x-org': 'b', 'x-permissions': perms } },
    );
    expect(foreignOrg.status).toBe(404);
  });
  it('defaults eligibility to accepted workflow categories; pending/rejected/withdrawn entries are omitted', async () => {
    const { app, entryCategories } = build();
    await activate(app);
    entryCategories.set(ids[1]!, 'pending');
    entryCategories.set(ids[2]!, 'withdrawn');
    const draft = await send(
      app,
      `/admin/events/${event}/modules/timing/results/drafts`,
      'POST',
      {},
    );
    expect(draft.status).toBe(201);
    const results = (
      (await draft.json()) as { results: { entryId: string; status: string }[] }
    ).results;
    expect(results.map((x) => x.entryId)).toEqual([ids[0]]);
    expect(results[0]?.status).toBe('DNS');
  });
  it('scores fastest-run partial runs by default while zero runs are DNS; sum still requires all runs', async () => {
    const { app } = build();
    await activate(app);
    await send(
      app,
      `/admin/events/${event}/modules/timing/measurements`,
      'POST',
      {
        entryId: ids[0],
        run: 1,
        timeMs: 500,
        source: 'manual',
        recordedAt: '2026-10-29T10:00:00Z',
      },
    );
    const fastest = await send(
      app,
      `/admin/events/${event}/modules/timing/results/drafts`,
      'POST',
      {},
    );
    const fastResults = (
      (await fastest.json()) as {
        results: { entryId: string; status: string; scoreMs: number | null }[];
      }
    ).results;
    expect(fastResults.find((x) => x.entryId === ids[0])).toMatchObject({
      status: 'classified',
      scoreMs: 500,
    });
    expect(fastResults.filter((x) => x.status === 'DNS')).toHaveLength(2);
    await send(app, `/admin/events/${event}/modules/timing`, 'PATCH', {
      config: {
        version: 1,
        runStructure: { runCount: 3, label: 'Run' },
        scoringRule: {
          version: 1,
          method: 'fastest-run',
          completionPolicy: 'all-runs',
        },
      },
    });
    const strictFastest = await send(
      app,
      `/admin/events/${event}/modules/timing/results/drafts`,
      'POST',
      {},
    );
    const strictResults = (
      (await strictFastest.json()) as {
        results: { entryId: string; status: string }[];
      }
    ).results;
    expect(strictResults.find((x) => x.entryId === ids[0])?.status).toBe('DNF');
    await send(app, `/admin/events/${event}/modules/timing`, 'PATCH', {
      config: {
        version: 1,
        runStructure: { runCount: 3, label: 'Run' },
        scoringRule: { version: 1, method: 'sum' },
      },
    });
    const sum = await send(
      app,
      `/admin/events/${event}/modules/timing/results/drafts`,
      'POST',
      {},
    );
    const sumResults = (
      (await sum.json()) as {
        results: { status: string; scoreMs: number | null }[];
      }
    ).results;
    expect(
      sumResults.some((x) => x.status === 'DNF' && x.scoreMs === null),
    ).toBe(true);
    expect(
      sumResults.filter((x) => x.status === 'DNS' && x.scoreMs === null),
    ).toHaveLength(2);
  });
  it('returns a validated conflict when runCount is reduced below existing measurements', async () => {
    const { app } = build();
    await activate(app);
    await send(
      app,
      `/admin/events/${event}/modules/timing/measurements`,
      'POST',
      {
        entryId: ids[0],
        run: 3,
        timeMs: 500,
        source: 'manual',
        recordedAt: '2026-10-29T10:00:00Z',
      },
    );
    await send(app, `/admin/events/${event}/modules/timing`, 'PATCH', {
      config: {
        version: 1,
        runStructure: { runCount: 2, label: 'Run' },
        scoringRule: { version: 1, method: 'fastest-run' },
      },
    });
    const response = await send(
      app,
      `/admin/events/${event}/modules/timing/results/drafts`,
      'POST',
      {},
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'Configured run count is lower than existing measurements',
    });
  });
  it('includes accepted starters without measurements as DNS in drafts, never as partial sum scores', async () => {
    const { app } = build();
    await activate(app);
    await send(
      app,
      `/admin/events/${event}/modules/timing/measurements`,
      'POST',
      {
        entryId: ids[0],
        run: 1,
        timeMs: 5,
        source: 'manual',
        recordedAt: '2026-10-29T10:00:00Z',
      },
    );
    await send(app, `/admin/events/${event}/modules/timing`, 'PATCH', {
      config: {
        version: 1,
        runStructure: { runCount: 3, label: 'Run' },
        scoringRule: { version: 1, method: 'sum' },
      },
    });
    const draft = await send(
      app,
      `/admin/events/${event}/modules/timing/results/drafts`,
      'POST',
      {},
    );
    expect(draft.status).toBe(201);
    const results = (
      (await draft.json()) as {
        results: { entryId: string; status: string; scoreMs: number | null }[];
      }
    ).results;
    expect(results).toHaveLength(3);
    expect(
      results.filter(
        (result) => result.status === 'DNS' && result.scoreMs === null,
      ),
    ).toHaveLength(2);
    expect(
      results.find(
        (result) => result.status === 'DNF' && result.scoreMs === null,
      ),
    ).toBeTruthy();
  });
  it('exposes only published results through the public module guard', async () => {
    const { app } = build();
    await activate(app);
    await send(
      app,
      '/admin/events/' + event + '/modules/timing/measurements',
      'POST',
      {
        entryId: ids[0],
        run: 1,
        timeMs: 10,
        source: 'manual',
        recordedAt: '2026-10-29T10:00:00Z',
      },
    );
    expect(
      (await app.request('/public/events/' + event + '/timing/results')).status,
    ).toBe(404);
    const draft = await send(
      app,
      '/admin/events/' + event + '/modules/timing/results/drafts',
      'POST',
      {},
    );
    expect(
      (
        await send(
          app,
          '/admin/events/' + event + '/modules/timing/results/1/publish',
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    const response = await app.request(
      '/public/events/' + event + '/timing/results',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: 1,
      status: 'published',
    });
    await send(app, '/admin/events/' + event + '/modules/timing', 'PATCH', {
      enabled: false,
    });
    expect(
      (await app.request('/public/events/' + event + '/timing/results')).status,
    ).toBe(200);
    expect(draft.status).toBe(201);
  });
});
