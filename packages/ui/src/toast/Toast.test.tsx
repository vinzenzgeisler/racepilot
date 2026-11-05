import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Toast } from './Toast.js';
it('announces a message and labels its dismiss control from caller copy', () => {
  const html = renderToStaticMarkup(
    <Toast dismissLabel="Schließen">Gespeichert</Toast>,
  );
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-label="Schließen"');
});
