import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WorkspaceSplit } from './WorkspaceSplit.js';

it('places filters, content and preview as sibling grid cells without script measurement', () => {
  const html = renderToStaticMarkup(
    <WorkspaceSplit
      filters={<p>Filter</p>}
      preview={<p>Vorschau</p>}
      previewLabel="Nennungsvorschau"
    >
      <p>Liste</p>
    </WorkspaceSplit>,
  );
  const order = ['Filter', 'Liste', 'Vorschau'].map((text) =>
    html.indexOf(`<p>${text}</p>`),
  );
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(html).toContain('nb-workspace-split has-preview');
  expect(html).toContain('aria-label="Nennungsvorschau"');
  expect(html).not.toContain('style=');
});

it('renders a single column without preview', () => {
  const html = renderToStaticMarkup(
    <WorkspaceSplit>
      <p>Liste</p>
    </WorkspaceSplit>,
  );
  expect(html).not.toContain('has-preview');
  expect(html).not.toContain('<aside');
});
