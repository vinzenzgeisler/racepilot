import { describe, expect, it } from 'vitest';
import { calculateTimingResults } from './timing.js';

describe('calculateTimingResults', () => {
  const competitors = [
    {
      entryId: 'a',
      startNumber: '10',
      runs: [
        { run: 1, timeMs: 1000 },
        { run: 2, timeMs: 1100 },
      ],
    },
    {
      entryId: 'b',
      startNumber: '2',
      runs: [
        { run: 1, timeMs: 900, penaltyMs: 100 },
        { run: 2, timeMs: 1200 },
      ],
    },
    {
      entryId: 'c',
      startNumber: '3',
      runs: [
        { run: 1, timeMs: 950 },
        { run: 2, timeMs: 1050 },
      ],
    },
  ];
  it('ranks fastest run and sums with deterministic ties', () => {
    expect(
      calculateTimingResults(competitors, {
        version: 1,
        method: 'fastest-run',
        runCount: 2,
      }).map(({ entryId, rank }) => [entryId, rank]),
    ).toEqual([
      ['c', 1],
      ['b', 2],
      ['a', 2],
    ]);
    expect(
      calculateTimingResults(competitors, {
        version: 1,
        method: 'sum',
        runCount: 2,
      }).map(({ entryId, rank }) => [entryId, rank]),
    ).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('scores target-time consistency and applies penalties and exclusions', () => {
    const result = calculateTimingResults(
      [
        ...competitors,
        {
          entryId: 'dns',
          startNumber: '4',
          exclusion: 'DNS' as const,
          runs: [],
        },
      ],
      { version: 1, method: 'target-deviation', targetMs: 1000, runCount: 2 },
    );
    expect(
      result.map(({ entryId, rank, scoreMs }) => [entryId, rank, scoreMs]),
    ).toEqual([
      ['c', 1, 100],
      ['a', 1, 100],
      ['b', 3, 200],
      ['dns', null, null],
    ]);
  });

  it('rejects invalid rules and duplicate or malformed runs', () => {
    expect(() =>
      calculateTimingResults([], { version: 2, method: 'sum', runCount: 1 }),
    ).toThrow(/Unsupported timing rule version/);
    expect(() =>
      calculateTimingResults([], {
        version: 1,
        method: 'target-deviation',
        runCount: 1,
      }),
    ).toThrow(/targetMs/);
    expect(() =>
      calculateTimingResults(
        [
          {
            entryId: 'a',
            startNumber: '1',
            runs: [
              { run: 1, timeMs: 100 },
              { run: 1, timeMs: 200 },
            ],
          },
        ],
        { version: 1, method: 'sum', runCount: 1 },
      ),
    ).toThrow(/duplicate/);
  });
});
