import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Tabs } from './Tabs.js';
it('exposes tabs and a linked active panel', () => {
  const html = renderToStaticMarkup(
    <Tabs
      label="Ansicht"
      selected="a"
      onChange={vi.fn()}
      tabs={[{ id: 'a', label: 'Liste', content: 'Inhalt' }]}
    />,
  );
  expect(html).toContain('role="tablist"');
  expect(html).toContain('role="tabpanel"');
});
