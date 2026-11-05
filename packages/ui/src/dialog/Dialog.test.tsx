import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Dialog } from './Dialog.js';
it('renders a labelled native modal dialog', () => {
  const html = renderToStaticMarkup(
    <Dialog open title="Bestätigen" closeLabel="Schließen" onClose={vi.fn()}>
      Text
    </Dialog>,
  );
  expect(html).toContain('<dialog');
  expect(html).toMatch(/aria-labelledby="([^"]+)"/);
  expect(html).toMatch(/id="([^"]+)"/);
});
