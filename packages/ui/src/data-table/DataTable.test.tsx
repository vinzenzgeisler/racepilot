import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DataTable } from './DataTable.js';
it('renders accessible column headers', () => {
  expect(
    renderToStaticMarkup(<DataTable headers={['Fahrer']}>Rows</DataTable>),
  ).toContain('scope="col"');
});
