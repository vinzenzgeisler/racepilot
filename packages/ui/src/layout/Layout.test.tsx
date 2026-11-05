import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Inline, Stack } from './Layout.js';
it('provides semantic-neutral vertical and horizontal layout primitives', () => {
  expect(renderToStaticMarkup(<Stack gap={4}>A</Stack>)).toContain(
    'nb-stack nb-gap-4',
  );
  expect(renderToStaticMarkup(<Inline>B</Inline>)).toContain('nb-inline');
});
