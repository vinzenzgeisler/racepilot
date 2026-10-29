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
      '/registration/status?token=one-time-secret',
    );
    const fetch = vi.fn(async () => ({
      json: async () => ({
        statuses: [
          {
            eventName: 'Demo',
            statusKey: 'waitlisted',
            label: 'Warteliste',
            color: '#a16207',
          },
        ],
      }),
    }));
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
    } finally {
      root.unmount();
    }
  });
});
