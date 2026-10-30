import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { typography } from '../tokens.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('M2/M4 foundation fidelity', () => {
  it('uses valid em-based tracking and preserves the M4 Archivo width per stage', async () => {
    const css = await read('../tokens.css');
    expect(css).not.toMatch(/--type-[\w-]+-tracking:\s*[-+]?\d+(?:\.\d+)?%;/);
    expect(typography.display.webDesktop).toMatchObject({
      widthPercent: 125,
      letterSpacing: '-0.04em',
    });
    expect(typography.h1.webDesktop.widthPercent).toBe(122);
    expect(typography.h2.webDesktop.widthPercent).toBe(118);
    expect(typography.h3.webDesktop.widthPercent).toBe(112);
    expect(typography.digits.webDesktop.widthPercent).toBe(62);
  });

  it('ships the M2-derived square app icon and distinct trademark notice', async () => {
    const icon = await read('../brand/app-icon.svg');
    const notice = await read('../../../../TRADEMARKS.md');
    expect(icon).toContain('viewBox="0 0 160 160"');
    expect(icon).toContain('#193B30');
    expect(icon).toContain('#F5F4EE');
    expect(notice).toContain('ordinary self-hosting');
    expect(notice).toContain('does not assert that any mark is registered');
  });
});
