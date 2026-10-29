// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminModules } from './AdminModules.js';

const item = {
  id: 'example.noop',
  version: '1.0.0',
  displayName: 'No-op',
  description: '',
  gallery: {
    name: { de: 'Modul', en: 'Module' },
    shortDescription: { de: 'Kurz', en: 'Short' },
    longDescription: { de: 'Lang', en: 'Long' },
    category: 'other',
    icon: 'puzzle',
    source: 'official',
    editions: ['community', 'cloud'],
    entitlement: 'included',
  },
  dependencies: [],
  enabled: false,
  entitled: true,
  configValid: true,
  available: true,
  status: 'available',
  unavailableReason: null,
  config: { label: 'default' },
  stateVersion: null,
  updatedAt: null,
  updatedBy: null,
};

describe('AdminModules', () => {
  it('activates, configures and confirms a data-preserving deactivation', async () => {
    const originalFetch = globalThis.fetch;
    let current: Record<string, unknown> = { ...item };
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(_input) === '/admin/events')
          return new Response('[]', { status: 200 });
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as {
            enabled?: boolean;
            config?: unknown;
          };
          current = {
            ...current,
            ...body,
            enabled: body.enabled ?? current.enabled,
            config: body.config ?? current.config,
          };
          return new Response(JSON.stringify(current), { status: 200 });
        }
        return new Response(JSON.stringify({ modules: [current] }), {
          status: 200,
        });
      },
    );
    globalThis.fetch = fetch;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<AdminModules />);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Activate')
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(
        fetch.mock.calls.some(
          ([, init]) =>
            init?.method === 'PATCH' &&
            String(init.body).includes('"enabled":true'),
        ),
      ).toBe(true);
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Details')
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const textarea = container.querySelector('textarea')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          textarea.ownerDocument.defaultView!.HTMLTextAreaElement.prototype,
          'value',
        )?.set?.call(textarea, '{"label":"changed"}');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Save')
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(
        fetch.mock.calls.some(
          ([, init]) =>
            init?.method === 'PATCH' && String(init.body).includes('"config"'),
        ),
      ).toBe(true);
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Disable')
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('retained'),
      );
      expect(
        fetch.mock.calls.some(
          ([, init]) =>
            init?.method === 'PATCH' &&
            String(init.body).includes('"enabled":false'),
        ),
      ).toBe(true);
    } finally {
      root.unmount();
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });
});
