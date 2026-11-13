import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FormItem } from './FormItem.js';
it('names a repeated entry as its own group', () => {
  const html = renderToStaticMarkup(
    <FormItem label="Fahrzeugschein">Felder</FormItem>,
  );
  expect(html).toContain('role="group"');
  expect(html).toContain('aria-label="Fahrzeugschein"');
});
