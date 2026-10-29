// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParticipantStatus } from './ParticipantStatus.js';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('participant status view', () => {
  it('redeems the one-time link and displays the localized pinned status', async () => {
    window.history.replaceState(
      {},
      '',
      '/registration/status#token=one-time-secret',
    );
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return {
          json: async () => ({
            statuses: [
              {
                eventName: 'Demo',
                driverName: 'A. E.',
                className: 'Touring',
                statusKey: 'waitlisted',
                label: 'Warteliste',
                color: '#a16207',
              },
            ],
          }),
        };
      },
    );
    vi.stubGlobal('fetch', fetch);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<ParticipantStatus organizationId="org" locale="de" />);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(fetch).toHaveBeenCalledWith(
        '/public/registration/status/redeem',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(container.textContent).toContain('Warteliste');
      expect(container.textContent).toContain('waitlisted');
      expect(container.textContent).not.toContain('one-time-secret');
      expect(window.location.search).toBe('');
      expect(window.location.hash).toBe('');
      expect(fetch).toHaveBeenCalledWith(
        '/public/registration/status/redeem',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'one-time-secret' }),
        }),
      );
      expect(fetch.mock.calls[0]?.[0]).not.toContain('one-time-secret');
      expect(container.textContent).toContain('A. E.');
      expect(container.textContent).toContain('Touring');
    } finally {
      root.unmount();
    }
  });

  it('removes the token from history before a failed redemption and preserves unrelated URL parts', async () => {
    window.history.replaceState(
      { marker: true },
      '',
      '/registration/status?view=compact#token=one-time-secret&status',
    );
    const fetch = vi.fn(async () => {
      expect(window.location.search).toBe('?view=compact');
      expect(window.location.hash).toBe('#status=');
      throw new Error('network failure');
    });
    vi.stubGlobal('fetch', fetch);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<ParticipantStatus organizationId="org" locale="en" />);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(container.textContent).toContain(
        'invalid, expired, or already used',
      );
      expect(window.location.search).not.toContain('token');
      expect(window.location.hash).toBe('#status=');
    } finally {
      root.unmount();
    }
  });
});
