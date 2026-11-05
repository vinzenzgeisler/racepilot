import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TechnicalLabel } from './TechnicalLabel.js';
it('renders caller-provided technical label text', () => {
  expect(renderToStaticMarkup(<TechnicalLabel>R1</TechnicalLabel>)).toContain(
    'R1',
  );
});
