import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EmptyState } from './EmptyState.js';
it('provides a heading and optional action region', () => {
  expect(
    renderToStaticMarkup(
      <EmptyState title="Keine Einträge" description="Noch leer" />,
    ),
  ).toContain('<h2>Keine Einträge</h2>');
});
