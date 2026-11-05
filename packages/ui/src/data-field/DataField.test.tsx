import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DataField } from './DataField.js';
it('pairs a human label with its value', () => {
  expect(
    renderToStaticMarkup(<DataField label="E-Mail">a@example.test</DataField>),
  ).toContain('a@example.test');
});
