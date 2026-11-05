// @vitest-environment jsdom
import { act, createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { SplitPane } from './SplitPane.js';

describe('SplitPane', () => {
  it('keeps its main content and complementary aside semantic', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        createElement(SplitPane, {
          main: createElement('p', null, 'Formular'),
          aside: createElement('p', null, 'Vorschau'),
          asideFirstOnMobile: true,
        }),
      ),
    );
    expect(container.querySelector('.nb-split-pane')?.className).toContain(
      'nb-aside-first-mobile',
    );
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('aside')?.textContent).toBe('Vorschau');
    root.unmount();
  });
});
