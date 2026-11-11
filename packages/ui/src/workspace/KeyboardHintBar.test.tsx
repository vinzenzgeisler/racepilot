import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { KeyboardHintBar } from './KeyboardHintBar.js';

it('renders keyboard instructions as a compact reusable hint bar', () => {
  const html = renderToStaticMarkup(
    <KeyboardHintBar
      items={[
        { keys: '↑ ↓', label: 'wechseln' },
        { keys: 'Enter', label: 'öffnen' },
        { keys: 'Esc', label: 'schließen' },
      ]}
    />,
  );

  expect(html).toContain('class="nb-keyboard-hint-bar"');
  expect(html).toContain('↑ ↓</kbd> wechseln');
  expect(html).toContain(' · ');
});
