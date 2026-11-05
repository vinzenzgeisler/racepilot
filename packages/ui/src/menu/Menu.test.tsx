import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Menu, MenuItem } from './Menu.js';
it('uses native disclosure semantics and localized trigger labels', () => {
  const html = renderToStaticMarkup(
    <Menu label="Aktionen">
      <MenuItem>Öffnen</MenuItem>
    </Menu>,
  );
  expect(html).toContain('aria-label="Aktionen"');
  expect(html).toContain('<details');
});
