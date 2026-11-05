import type { RequestContext } from '@racepilot/core';

export interface TimingMeasurementInput {
  readonly entryId: string;
  readonly run: number;
  readonly timeMs: number;
  readonly penaltyMs?: number;
  readonly exclusion?: 'DNF' | 'DNS' | 'DSQ' | null;
  readonly source: string;
  readonly recordedAt: string;
}

export interface TimingMeasurementRecord extends TimingMeasurementInput {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly version: number;
  readonly supersedesId: string | null;
  readonly active: boolean;
  readonly recordedBy: string;
}

export interface TimingRepository {
  listEntries(
    ctx: RequestContext,
    eventId: string,
  ): Promise<
    { entryId: string; startNumber: string; statusCategory: string | null }[]
  >;
  record(
    ctx: RequestContext,
    eventId: string,
    input: TimingMeasurementInput,
    actor: string,
  ): Promise<TimingMeasurementRecord | null>;
  recordMany(
    ctx: RequestContext,
    eventId: string,
    input: readonly TimingMeasurementInput[],
    actor: string,
  ): Promise<TimingMeasurementRecord[]>;
  list(
    ctx: RequestContext,
    eventId: string,
  ): Promise<TimingMeasurementRecord[]>;
  correct(
    ctx: RequestContext,
    eventId: string,
    measurementId: string,
    input: Partial<TimingMeasurementInput>,
    actor: string,
  ): Promise<TimingMeasurementRecord | null>;
  resolveEntry(
    ctx: RequestContext,
    eventId: string,
    lookup: { entryId?: string; startNumber?: string },
  ): Promise<{ entryId: string; startNumber: string } | null>;
  createDraft(
    ctx: RequestContext,
    eventId: string,
    rule: unknown,
    results: unknown,
    actor: string,
  ): Promise<TimingResultVersion | null>;
  publish(
    ctx: RequestContext,
    eventId: string,
    version: number,
    actor: string,
  ): Promise<TimingResultVersion | null>;
  latestPublished(
    ctx: RequestContext,
    eventId: string,
  ): Promise<TimingResultVersion | null>;
}

export interface TimingResultVersion {
  readonly eventId: string;
  readonly version: number;
  readonly status: 'draft' | 'published';
  readonly rule: unknown;
  readonly results: unknown;
  readonly actor: string;
  readonly createdAt: string;
  readonly publishedAt: string | null;
}

export type TimingDbRow = {
  id: string;
  organization_id: string;
  event_id: string;
  entry_id: string;
  run: number;
  time_ms: number;
  penalty_ms: number;
  exclusion: 'DNF' | 'DNS' | 'DSQ' | null;
  source: string;
  recorded_at: Date | string;
  recorded_by: string;
  version: number;
  supersedes_id: string | null;
  active: boolean;
};

export const mapTimingRow = (row: TimingDbRow): TimingMeasurementRecord => ({
  id: row.id,
  organizationId: row.organization_id,
  eventId: row.event_id,
  entryId: row.entry_id,
  run: row.run,
  timeMs: row.time_ms,
  penaltyMs: row.penalty_ms,
  ...(row.exclusion ? { exclusion: row.exclusion } : {}),
  source: row.source,
  recordedAt: new Date(row.recorded_at).toISOString(),
  recordedBy: row.recorded_by,
  version: row.version,
  supersedesId: row.supersedes_id,
  active: row.active,
});

export type TimingResultDbRow = {
  event_id: string;
  version: number;
  status: 'draft' | 'published';
  rule: unknown;
  results: unknown;
  actor: string;
  created_at: Date | string;
  published_at: Date | string | null;
};

export const mapTimingResult = (r: TimingResultDbRow): TimingResultVersion => ({
  eventId: r.event_id,
  version: r.version,
  status: r.status,
  rule: r.rule,
  results: r.results,
  actor: r.actor,
  createdAt: new Date(r.created_at).toISOString(),
  publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
});

export const timingUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isDuplicateTimingRun = (error: unknown) => {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const candidate = current as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      candidate.code === '23505' ||
      candidate.constraint === 'timing_measurement_one_active_run'
    )
      return true;
    if (candidate.message?.includes('timing_measurement_one_active_run'))
      return true;
    current = candidate.cause;
  }
  return false;
};
