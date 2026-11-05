import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Checkbox, Radio, Switch } from './Choice.js';
it('renders native checkbox, radio, and switch controls', () => {
  const html = renderToStaticMarkup(
    <>
      <Checkbox label="Ja" />
      <Radio label="Nein" />
      <Switch label="Aktiv" />
    </>,
  );
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('type="radio"');
  expect(html).toContain('role="switch"');
});
