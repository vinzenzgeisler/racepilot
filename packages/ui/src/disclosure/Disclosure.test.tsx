import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Disclosure } from './Disclosure.js';
it('uses the native disclosure element with a visible summary', () => {
  expect(
    renderToStaticMarkup(<Disclosure label="Mehr">Details</Disclosure>),
  ).toContain('<summary>Mehr</summary>');
});
