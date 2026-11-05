import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { StartLine } from './StartLine.js';
it('renders decorative start-line geometry', () => {
  expect(renderToStaticMarkup(<StartLine />)).toContain('nb-start-line');
});
