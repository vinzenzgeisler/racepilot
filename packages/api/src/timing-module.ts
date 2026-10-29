import { z } from 'zod';
import type { ModuleDefinition } from '@racepilot/core';

export const TimingConfigSchema = z
  .object({
    version: z.literal(1),
    runStructure: z
      .object({
        runCount: z.number().int().min(1).max(100),
        label: z.string().trim().min(1).max(100).default('Run'),
      })
      .strict(),
    eligibleEntryCategories: z
      .array(
        z.enum(['pending', 'accepted', 'rejected', 'waitlisted', 'withdrawn']),
      )
      .min(1)
      .default(['accepted']),
    incompleteRunStatus: z.enum(['DNF', 'DNS']).default('DNF'),
    zeroRunStatus: z.enum(['DNF', 'DNS']).default('DNS'),
    scoringRule: z.discriminatedUnion('method', [
      z
        .object({
          version: z.number().int().min(1),
          method: z.literal('fastest-run'),
          completionPolicy: z.enum(['all-runs', 'available-runs']).optional(),
        })
        .strict(),
      z
        .object({
          version: z.number().int().min(1),
          method: z.literal('sum'),
          completionPolicy: z.enum(['all-runs', 'available-runs']).optional(),
        })
        .strict(),
      z
        .object({
          version: z.number().int().min(1),
          method: z.literal('target-deviation'),
          targetMs: z.number().finite().nonnegative(),
          completionPolicy: z.enum(['all-runs', 'available-runs']).optional(),
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (
      config.scoringRule.method !== 'fastest-run' &&
      config.scoringRule.completionPolicy === 'available-runs'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['scoringRule', 'completionPolicy'],
        message: 'available-runs is only valid for fastest-run scoring',
      });
    }
  });
export type TimingConfig = z.infer<typeof TimingConfigSchema>;
export const defaultTimingConfig: TimingConfig = {
  version: 1,
  runStructure: { runCount: 3, label: 'Run' },
  eligibleEntryCategories: ['accepted'],
  incompleteRunStatus: 'DNF',
  zeroRunStatus: 'DNS',
  scoringRule: { version: 1, method: 'fastest-run' },
};

const routes = [
  { method: 'POST', path: '/measurements', permission: 'timing:record' },
  { method: 'POST', path: '/measurements/csv', permission: 'timing:record' },
  {
    method: 'GET',
    path: '/measurements',
    permission: 'timing:read',
    archivedRead: true,
  },
  {
    method: 'POST',
    path: '/measurements/:measurementId/corrections',
    permission: 'timing:correct',
  },
  { method: 'POST', path: '/results/drafts', permission: 'timing:publish' },
  {
    method: 'POST',
    path: '/results/:version/publish',
    permission: 'timing:publish',
  },
  {
    method: 'GET',
    path: '/results',
    permission: 'timing:read',
    archivedRead: true,
  },
  {
    method: 'GET',
    path: '/results.csv',
    permission: 'timing:read',
    archivedRead: true,
  },
  {
    method: 'GET',
    path: '/published-public',
    archivedRead: true,
    publicPath: '/public/events/:eventId/timing/results',
  },
] as const;

export const timingModule: ModuleDefinition = {
  manifest: {
    id: 'timing',
    version: '1.0.0',
    displayName: 'Timing',
    description: 'Manual and CSV event timing with versioned results.',
    gallery: {
      name: { de: 'Zeitnahme', en: 'Timing' },
      shortDescription: {
        de: 'Laufzeiten erfassen und nachvollziehbare Ergebnisse veröffentlichen.',
        en: 'Record run times and publish auditable results.',
      },
      longDescription: {
        de: 'Erfasst manuelle und importierte Laufzeiten, dokumentiert Korrekturen und veröffentlicht versionierte Wertungen.',
        en: 'Records manual and imported run times, audits corrections, and publishes versioned scoring.',
      },
      category: 'timing',
      icon: 'timer',
      source: 'official',
      editions: ['community', 'cloud'],
      entitlement: 'included',
    },
    dependencies: [],
    permissions: [
      {
        key: 'timing:record',
        description: 'Record timing measurements',
        impliedBy: ['event:write'],
      },
      {
        key: 'timing:correct',
        description: 'Correct recorded measurements',
        impliedBy: ['event:write'],
      },
      {
        key: 'timing:publish',
        description: 'Create and publish results',
        impliedBy: ['event:write'],
      },
      {
        key: 'timing:read',
        description: 'Read timing measurements and results',
        impliedBy: ['event:read'],
      },
    ],
    capabilities: ['timing.results'],
    tables: ['timing_measurement', 'timing_result_version', 'timing_audit'],
    migrations: ['0015_timing.sql'],
    routes: [...routes],
    ui: [],
    jobs: [],
  },
  configSchema: TimingConfigSchema,
  defaultConfig: defaultTimingConfig,
};
