import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from './App.js';

describe('App', () => {
  it('renders the neutral product shell and contract status', () => {
    const markup = renderToStaticMarkup(<App />);
    expect(markup).toContain('RacePilot');
    expect(markup).toContain('Service status: ok');
  });
});
