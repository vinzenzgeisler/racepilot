import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FieldPreview, FieldPreviewList } from './FieldPreview.js';

it('shows each field with its requirement', () => {
  const html = renderToStaticMarkup(
    <FieldPreviewList title="Fahrer" empty="Keine Felder">
      <FieldPreview label="Telefon" state="required" stateLabel="Pflicht" />
      <FieldPreview label="Ort" state="optional" stateLabel="Freiwillig" />
    </FieldPreviewList>,
  );
  expect(html).toContain('is-required');
  expect(html).toContain('<small>Freiwillig</small>');
});

it('says when a group has no fields', () => {
  expect(
    renderToStaticMarkup(
      <FieldPreviewList title="Fahrer" empty="Keine Felder">
        {[false, null]}
      </FieldPreviewList>,
    ),
  ).toContain('<p>Keine Felder</p>');
});
