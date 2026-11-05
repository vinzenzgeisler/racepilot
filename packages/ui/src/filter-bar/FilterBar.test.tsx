import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FilterBar } from './FilterBar.js';
it('labels the filter region and hosts its controls', () => {
  expect(
    renderToStaticMarkup(
      <FilterBar label="Nennungen filtern">Suchfeld</FilterBar>,
    ),
  ).toContain('aria-label="Nennungen filtern"');
});
