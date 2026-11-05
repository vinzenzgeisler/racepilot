import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Field, SelectField } from './Field.js';
it('associates labels with single-line and select controls', () => {
  expect(renderToStaticMarkup(<Field label="Name" />)).toContain('Name');
  expect(renderToStaticMarkup(<SelectField label="Class" />)).toContain(
    '<select',
  );
});
