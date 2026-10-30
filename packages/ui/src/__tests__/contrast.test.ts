import { describe, expect, it } from 'vitest';
import { contrastPairs } from '../tokens.js';

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => parseInt(part, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

describe('documented WCAG contrast pairs', () => {
  it.each(contrastPairs)(
    '$foreground on $background meets AA and matches its documented ratio',
    ({ foreground, background, ratio }) => {
      const first = luminance(foreground);
      const second = luminance(background);
      const actual =
        (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      expect(actual).toBeGreaterThanOrEqual(4.5);
      expect(actual).toBeCloseTo(ratio, 0);
    },
  );
});
