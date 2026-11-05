import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Textarea } from './Textarea.js';
it('renders a labelled native multiline input', () => {
  expect(
    renderToStaticMarkup(<Textarea label="Bedingungen" required />),
  ).toContain('<textarea');
});
