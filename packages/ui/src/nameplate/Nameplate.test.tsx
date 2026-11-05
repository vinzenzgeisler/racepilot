import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Nameplate } from './Nameplate.js';
it('presents a name and optional detail', () => {
  expect(
    renderToStaticMarkup(<Nameplate name="Ada" detail="Startnummer 1" />),
  ).toContain('Startnummer 1');
});
