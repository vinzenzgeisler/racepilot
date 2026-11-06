import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { StatusLabel } from './StatusLabel.js';
it('requires caller-supplied human text and preserves the status meaning', () => {
  const html = renderToStaticMarkup(<StatusLabel status="new" label="Offen" />);
  expect(html).toContain('Offen');
  expect(html).not.toContain('pending');
});

it('renders the empty state as a single dash independent of the label text', () => {
  for (const label of ['–', 'Keine Angabe']) {
    const html = renderToStaticMarkup(
      <StatusLabel status="empty" label={label} />,
    );
    expect(html).toContain('nb-status-empty');
    expect(html).toContain('<span aria-hidden="true">–</span>');
    expect(html).not.toContain('nb-status-mark');
  }
});

it('keeps the mark for a not-relevant status with a text label', () => {
  const html = renderToStaticMarkup(
    <StatusLabel status="not_relevant" label="–" />,
  );
  expect(html).toContain('nb-status-mark-text');
});
