import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Button } from './Button.js';
it('renders its supplied label and accessible native button', () => {
  expect(renderToStaticMarkup(<Button>Weiter</Button>)).toContain(
    'type="button"',
  );
});
