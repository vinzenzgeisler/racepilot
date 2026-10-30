import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../components.css', import.meta.url), 'utf8');

describe('button interaction cascade', () => {
  it('scopes interactive hover, focus and active states to enabled buttons', () => {
    expect(css).toContain('.nb-button:enabled:hover::before');
    expect(css).toContain('.nb-primary:enabled:focus-visible');
    expect(css).toContain('.nb-secondary:enabled:hover');
    expect(css).toContain('.nb-text:enabled:focus-visible');
    expect(css).toContain('.nb-button:enabled:active');
    expect(css).not.toContain('.nb-button:hover,\n.nb-button:focus-visible {');
  });

  it('keeps each non-primary variant readable on keyboard focus', () => {
    expect(css).toContain(`.nb-secondary:enabled:hover,
.nb-secondary:enabled:focus-visible,
.nb-text:enabled:hover,
.nb-text:enabled:focus-visible {
  color: var(--color-green);
  background: var(--color-sage);`);
    expect(css).toContain('.nb-danger:enabled:focus-visible');
    expect(css).toContain('outline: 3px solid var(--color-marshal)');
  });

  it('preserves disabled colors without allowing hover/focus rules to override them', () => {
    expect(css).toContain(
      '.nb-button:disabled {\n  background: #d3d8d2;\n  color: #5f6863;',
    );
    expect(css).toContain(
      '.nb-primary-dark:disabled {\n  background: #2e4f42;\n  color: #9fb3a8;',
    );
  });
});
