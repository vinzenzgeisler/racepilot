import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FormSection } from './FormSection.js';
it('groups related controls in a labelled fieldset', () => {
  expect(
    renderToStaticMarkup(<FormSection title="Fahrzeug">Angaben</FormSection>),
  ).toContain('<legend>Fahrzeug</legend>');
});
