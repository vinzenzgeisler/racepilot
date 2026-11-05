import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { StartLight } from './StartLight.js';
it('announces the caller-provided state label', () => {
  expect(
    renderToStaticMarkup(<StartLight state="go" label="Bereit" />),
  ).toContain('aria-label="Bereit"');
});
