import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Metric, MetricGrid } from './Metric.js';

it('pairs each label with its value inside a labelled description list', () => {
  const html = renderToStaticMarkup(
    <MetricGrid label="Kennzahlen">
      <Metric label="Offene Zahlungen" value="3" detail="120,00 €" />
    </MetricGrid>,
  );
  expect(html).toContain('aria-label="Kennzahlen"');
  expect(html).toContain('<dt>Offene Zahlungen</dt>');
  expect(html).toContain('<strong>3</strong>');
  expect(html).toContain('120,00 €');
});

it('marks attention figures and renders an optional action', () => {
  const html = renderToStaticMarkup(
    <MetricGrid label="Kennzahlen">
      <Metric
        label="Fehlende Unterlagen"
        value="2"
        tone="attention"
        action="Öffnen"
      />
    </MetricGrid>,
  );
  expect(html).toContain('is-attention');
  expect(html).toContain('nb-metric-action');
});
