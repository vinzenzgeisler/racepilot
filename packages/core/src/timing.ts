/** Versioned, deterministic timing rules. No discipline-specific scoring is implied. */

export const TIMING_RULE_VERSION = 1 as const;
export type TimingScoringMethod = 'fastest-run' | 'sum' | 'target-deviation';
export type TimingExclusion = 'DNF' | 'DNS' | 'DSQ';

export interface TimingRun {
  readonly run: number;
  readonly timeMs: number;
  readonly penaltyMs?: number;
  readonly exclusion?: TimingExclusion;
}
export interface TimingCompetitor {
  readonly entryId: string;
  readonly startNumber: string;
  readonly runs: readonly TimingRun[];
  readonly exclusion?: TimingExclusion;
}
export interface TimingRule {
  readonly version: number;
  readonly method: TimingScoringMethod;
  /** Required for target-deviation; ties are measured in absolute milliseconds. */
  readonly targetMs?: number;
  /** Number of configured runs included in the score. */
  readonly runCount: number;
}
export interface TimingRankedResult {
  readonly entryId: string;
  readonly startNumber: string;
  readonly rank: number | null;
  readonly status: 'classified' | TimingExclusion;
  /** Lower is better. Null means excluded or no valid runs. */
  readonly scoreMs: number | null;
  readonly completedRuns: number;
}

const exclusionOrder: Record<TimingExclusion, number> = {
  DNF: 0,
  DNS: 1,
  DSQ: 2,
};

/**
 * Rank by the configured rule; exact score ties share a rank. Deterministic
 * ordering within a tie (and among excluded entries) is start number, then ID.
 */
export function calculateTimingResults(
  competitors: readonly TimingCompetitor[],
  rule: TimingRule,
): TimingRankedResult[] {
  if (!Number.isInteger(rule.version) || rule.version < 1)
    throw new Error('Invalid timing rule version');
  if (rule.version !== TIMING_RULE_VERSION)
    throw new Error(`Unsupported timing rule version: ${rule.version}`);
  if (!Number.isInteger(rule.runCount) || rule.runCount < 1)
    throw new Error('Invalid run count');
  if (
    rule.method === 'target-deviation' &&
    (!Number.isFinite(rule.targetMs) || rule.targetMs! < 0)
  )
    throw new Error('Target-deviation requires a non-negative targetMs');

  const ids = new Set<string>();
  const prepared = competitors.map((competitor) => {
    if (!competitor.entryId || ids.has(competitor.entryId))
      throw new Error('Competitor entry IDs must be unique and non-empty');
    ids.add(competitor.entryId);
    const runNumbers = new Set<number>();
    const runs = competitor.runs.map((run) => {
      if (
        !Number.isInteger(run.run) ||
        run.run < 1 ||
        run.run > rule.runCount ||
        runNumbers.has(run.run) ||
        !Number.isFinite(run.timeMs) ||
        run.timeMs <= 0 ||
        !Number.isFinite(run.penaltyMs ?? 0) ||
        (run.penaltyMs ?? 0) < 0
      )
        throw new Error('Invalid or duplicate timing run');
      runNumbers.add(run.run);
      return { ...run, penaltyMs: run.penaltyMs ?? 0 };
    });
    const exclusion =
      competitor.exclusion ??
      runs.find((run) => run.exclusion)?.exclusion ??
      undefined;
    const completedRuns = runs.filter((run) => !run.exclusion).length;
    let scoreMs: number | null = null;
    if (!exclusion && completedRuns > 0) {
      const adjusted = runs
        .filter((run) => !run.exclusion)
        .map((run) => run.timeMs + run.penaltyMs);
      if (rule.method === 'fastest-run') scoreMs = Math.min(...adjusted);
      if (rule.method === 'sum') scoreMs = adjusted.reduce((a, b) => a + b, 0);
      if (rule.method === 'target-deviation')
        scoreMs = adjusted.reduce(
          (total, time) => total + Math.abs(time - rule.targetMs!),
          0,
        );
    }
    return {
      entryId: competitor.entryId,
      startNumber: competitor.startNumber,
      exclusion,
      completedRuns,
      scoreMs,
    };
  });

  prepared.sort((a, b) => {
    if (a.exclusion || b.exclusion) {
      if (!a.exclusion) return -1;
      if (!b.exclusion) return 1;
      const statusOrder =
        exclusionOrder[a.exclusion] - exclusionOrder[b.exclusion];
      if (statusOrder !== 0) return statusOrder;
    }
    if (a.scoreMs !== null && b.scoreMs !== null && a.scoreMs !== b.scoreMs)
      return a.scoreMs - b.scoreMs;
    if (a.scoreMs === null && b.scoreMs !== null) return 1;
    if (a.scoreMs !== null && b.scoreMs === null) return -1;
    const numberOrder = a.startNumber.localeCompare(b.startNumber, 'en', {
      numeric: true,
      sensitivity: 'base',
    });
    return numberOrder || a.entryId.localeCompare(b.entryId);
  });

  let rank = 0;
  let priorScore: number | null | undefined;
  return prepared.map((item, index) => {
    const status = item.exclusion ?? 'classified';
    if (status === 'classified' && item.scoreMs !== priorScore)
      rank = index + 1;
    if (status === 'classified') priorScore = item.scoreMs;
    return {
      entryId: item.entryId,
      startNumber: item.startNumber,
      rank: status === 'classified' && item.scoreMs !== null ? rank : null,
      status,
      scoreMs: item.scoreMs,
      completedRuns: item.completedRuns,
    };
  });
}
