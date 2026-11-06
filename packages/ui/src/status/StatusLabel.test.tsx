import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { StatusLabel } from './StatusLabel.js';
it('requires caller-supplied human text and preserves the status meaning', () => {
  const html = renderToStaticMarkup(<StatusLabel status="new" label="Offen" />);
  expect(html).toContain('Offen');
  expect(html).not.toContain('pending');
});

it('renders an empty status value as a single dash', () => {
  const html = renderToStaticMarkup(
    <StatusLabel status="not_relevant" label="–" />,
  );
  expect(html).toContain('>–</span>');
  expect(html).not.toContain('nb-status-mark-text');
});
