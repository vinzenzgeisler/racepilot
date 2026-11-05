import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DateInput } from './DateInput.js';
it('renders a native date control with a visible label', () => {
  expect(renderToStaticMarkup(<DateInput label="Beginn" />)).toContain(
    'type="date"',
  );
});
