import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TextInput } from './TextInput.js';
it('associates the label and validation message with the input', () => {
  const html = renderToStaticMarkup(
    <TextInput label="E-Mail" error="Ungültig" />,
  );
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('Ungültig');
  expect(html).toContain('for=');
});
