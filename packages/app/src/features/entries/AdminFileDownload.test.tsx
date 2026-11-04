// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { AdminFileDownload } from './AdminFileDownload.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('downloads protected bytes through the authenticated client, not navigation', async () => {
  vi.useFakeTimers();
  const blob = new Blob(['image bytes']);
  vi.mocked(adminFetch).mockResolvedValue({
    ok: true,
    blob: async () => blob,
  } as Response);
  const create = vi.fn().mockReturnValue('blob:test-download');
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  const saves: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saves.push(this.download);
  });
  const element = document.createElement('div');
  const root = createRoot(element);
  try {
    await act(async () =>
      root.render(
        <AdminFileDownload url="/admin/events/event/registration-form-uploads/image" />,
      ),
    );
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => {
      element.querySelector('a')!.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(adminFetch).toHaveBeenCalledWith(
      '/admin/events/event/registration-form-uploads/image',
      { cache: 'no-store' },
    );
    expect(create).toHaveBeenCalledWith(blob);
    expect(saves).toEqual(['registration-upload-image']);
    await vi.runAllTimersAsync();
    expect(revoke).toHaveBeenCalledWith('blob:test-download');
  } finally {
    await act(async () => root.unmount());
  }
});

it('shows a failed download without navigating or creating a public fallback', async () => {
  vi.mocked(adminFetch).mockResolvedValue({ ok: false } as Response);
  const element = document.createElement('div');
  const root = createRoot(element);
  try {
    await act(async () =>
      root.render(
        <AdminFileDownload url="/admin/events/event/registration-form-uploads/image" />,
      ),
    );
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => {
      element.querySelector('a')!.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'nicht geladen',
    );
  } finally {
    await act(async () => root.unmount());
  }
});
