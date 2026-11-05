import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Steps } from './Steps.js';
it('marks the current step and announces its supplied name', () => {
  const html = renderToStaticMarkup(
    <Steps
      steps={['A', 'B']}
      current={1}
      label="Schritt"
      completedLabel="Fertig"
    />,
  );
  expect(html).toContain('aria-current="step"');
  expect(html).toContain('aria-label="Schritt"');
});
