import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OccupancyBar, occupancyShare } from './OccupancyBar.js';

const copy = {
  unlimitedLabel: 'ohne Limit',
  fullLabel: 'Voll',
  valueText: '7 von 20 belegt',
};

it('caps the share at a full bar and never divides by a missing capacity', () => {
  expect(occupancyShare(7, 20)).toBe(35);
  expect(occupancyShare(25, 20)).toBe(100);
  expect(occupancyShare(3, 0)).toBe(100);
});

it('exposes the occupancy as a meter with readable text', () => {
  const html = renderToStaticMarkup(
    <OccupancyBar label="H2" occupied={7} capacity={20} {...copy} />,
  );
  expect(html).toContain('role="meter"');
  expect(html).toContain('aria-valuemax="20"');
  expect(html).toContain('aria-valuenow="7"');
  expect(html).toContain('aria-valuetext="7 von 20 belegt"');
  expect(html).toContain('--nb-occupancy:35%');
  expect(html).not.toContain('is-full');
});

it('flags a full class and omits the bar when there is no capacity', () => {
  const full = renderToStaticMarkup(
    <OccupancyBar label="M4" occupied={20} capacity={20} {...copy} />,
  );
  expect(full).toContain('is-full');
  expect(full).toContain('Voll');
  const open = renderToStaticMarkup(
    <OccupancyBar label="M6" occupied={5} capacity={null} {...copy} />,
  );
  expect(open).not.toContain('role="meter"');
  expect(open).toContain('ohne Limit');
});
