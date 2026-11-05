import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Pagination } from './Pagination.js';
it('renders navigation controls with unavailable edges disabled', () => {
  const html = renderToStaticMarkup(
    <Pagination
      page={1}
      pageCount={3}
      previousLabel="Zurück"
      nextLabel="Weiter"
      pageLabel={(p, c) => `${p} von ${c}`}
      onPageChange={vi.fn()}
    />,
  );
  expect(html).toContain('disabled');
  expect(html).toContain('1 von 3');
});
