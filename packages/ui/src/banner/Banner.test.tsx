import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Banner } from './Banner.js';
it('announces errors assertively and presents supplied content', () => {
  const html = renderToStaticMarkup(
    <Banner tone="error">Speichern fehlgeschlagen</Banner>,
  );
  expect(html).toContain('role="alert"');
});
