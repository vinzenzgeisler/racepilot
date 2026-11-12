import { describe, expect, it } from 'vitest';
import { deriveOrgaCodePrefix, formatOrgaCode } from './orga-code.js';

describe('orga-code rules', () => {
  it('uses a configured prefix normalized to uppercase', () => {
    expect(
      deriveOrgaCodePrefix({ orgaCodePrefix: ' race ', slug: 'other' }),
    ).toBe('RACE');
  });

  it('derives a sanitized prefix from the event slug and falls back when empty', () => {
    expect(
      deriveOrgaCodePrefix({ orgaCodePrefix: null, slug: 'race-2026!' }),
    ).toBe('RACE2026');
    expect(deriveOrgaCodePrefix({ orgaCodePrefix: null, slug: '---' })).toBe(
      'NEN',
    );
  });

  it('formats uppercase base36 sequences with a five-character minimum width', () => {
    expect(formatOrgaCode('RACE', 1)).toBe('RACE-00001');
    expect(formatOrgaCode('RACE', 36)).toBe('RACE-00010');
    expect(formatOrgaCode('RACE', 36 ** 5)).toBe('RACE-100000');
    expect(() => formatOrgaCode('RACE', 0)).toThrow(RangeError);
  });
});
