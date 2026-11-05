import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FileUpload } from './FileUpload.js';
it('uses a labelled, native file control and exposes the selected name', () => {
  const html = renderToStaticMarkup(
    <FileUpload label="Fahrzeugbild" selectedFileName="auto.png" />,
  );
  expect(html).toContain('type="file"');
  expect(html).toContain('auto.png');
});
