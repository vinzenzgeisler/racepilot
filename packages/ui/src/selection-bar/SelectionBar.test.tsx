import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SelectionBar } from './SelectionBar.js';
it('renders supplied selection labels without baking in locale strings', () => {
  const html = renderToStaticMarkup(
    <SelectionBar
      label="Auswahl"
      summary="2 markiert"
      actionLabel="Bestätigen"
      clearLabel="Leeren"
      onClear={vi.fn()}
    />,
  );
  expect(html).toContain('2 markiert');
  expect(html).toContain('Bestätigen');
});
