import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Icon } from './Icon.js';
it('keeps decorative icons hidden and labels meaningful icons', () => {
  expect(renderToStaticMarkup(<Icon name="list" />)).toContain(
    'aria-hidden="true"',
  );
  expect(renderToStaticMarkup(<Icon name="list" label="Liste" />)).toContain(
    'aria-label="Liste"',
  );
});
