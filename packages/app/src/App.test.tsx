// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

describe('App', () => {
  it('does not render organization data before a valid bootstrap and then renders accessible content', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        configurationVersion: 'v1',
        deploymentMode: 'community',
        organization: {
          id: '10000000-0000-4000-8000-000000000001',
          slug: 'demo',
          name: 'Demo Org',
        },
        branding: {
          logoUrl: null,
          primaryColor: '#174ea6',
          accentColor: '#8a5a00',
          contactEmail: null,
          eventImageUrl: null,
        },
        locale: 'en',
        activeEvent: null,
        capabilities: [],
        legalLinks: [],
      }),
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<App />);
      });
      expect(container.textContent).toContain('Demo Org');
      expect(container.querySelector('main')).toBeTruthy();
    } finally {
      root.unmount();
      globalThis.fetch = originalFetch;
    }
  });

  it('renders only a neutral state when bootstrap resolution fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<App />);
      });
      expect(container.textContent).toContain(
        'This service is currently unavailable.',
      );
      expect(container.textContent).not.toContain('Demo Org');
    } finally {
      root.unmount();
      globalThis.fetch = originalFetch;
    }
  });

  it('passes server bootstrap capabilities to the composed UI slot', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        configurationVersion: 'v1',
        deploymentMode: 'community',
        organization: {
          id: '10000000-0000-4000-8000-000000000001',
          slug: 'demo',
          name: 'Demo Org',
        },
        branding: {
          logoUrl: null,
          primaryColor: '#174ea6',
          accentColor: '#8a5a00',
          contactEmail: null,
          eventImageUrl: null,
        },
        locale: 'en',
        activeEvent: null,
        capabilities: ['private-example'],
        legalLinks: [],
      }),
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <App
            renderContribution={(config) =>
              config.capabilities.includes('private-example') ? (
                <aside>Private runtime contribution</aside>
              ) : null
            }
          />,
        );
      });
      expect(container.textContent).toContain('Private runtime contribution');
    } finally {
      root.unmount();
      globalThis.fetch = originalFetch;
    }
  });
});
