import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PageHeader } from './PageHeader.js';
it('renders the page title as the primary heading', () => {
  expect(renderToStaticMarkup(<PageHeader title="Nennungen" />)).toContain(
    '<h1>Nennungen</h1>',
  );
});
