// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, APP_NAVIGATION_REGISTRY } from './AppShell.js';

describe('AppShell', () => {
  it('groups primary navigation by the app registry and switches events accessibly', async () => {
    const onEventChange = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <AppShell
          events={[{ id: 'event-1', name: 'Historischer Bergpreis' }]}
          activeEvent="event-1"
          onEventChange={onEventChange}
        >
          <p>Shell content</p>
        </AppShell>,
      ),
    );
    expect(APP_NAVIGATION_REGISTRY.map((group) => group.label)).toEqual([
      'Veranstaltung',
      'Vor Ort',
      'Kommunikation',
      'Konto',
    ]);
    expect(
      container.querySelector('[aria-label="Veranstaltung"]'),
    ).toBeTruthy();
    const event = container.querySelector<HTMLSelectElement>('#app-event')!;
    await act(async () => {
      event.value = '';
      event.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onEventChange).toHaveBeenCalledWith('');
    expect(container.textContent).toContain('Shell content');
    await act(async () => root.unmount());
  });

  it('shows enabled private modules in the dedicated individual-module group only', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <AppShell
          modules={[
            {
              id: 'private.timer',
              displayName: 'Zeitnahme',
              source: 'private',
              enabled: true,
            },
            {
              id: 'private.hidden',
              displayName: 'Inaktiv',
              source: 'private',
              enabled: false,
            },
          ]}
        >
          <p>Content</p>
        </AppShell>,
      ),
    );
    expect(
      container.querySelector('[aria-label="Module · individuell"]')
        ?.textContent,
    ).toContain('Zeitnahme');
    expect(
      container.querySelector('[aria-label="Module · individuell"]')
        ?.textContent,
    ).not.toContain('Inaktiv');
    expect(
      container.querySelector('[aria-label="Hauptnavigation"]'),
    ).toBeTruthy();
    await act(async () => root.unmount());
  });
  it('closes the wide preview with Escape and keeps navigation keyboard focusable', async () => {
    const onClosePreview = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <AppShell onClosePreview={onClosePreview} previewOpen>
          <p>Content</p>
        </AppShell>,
      ),
    );
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(onClosePreview).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-label="Nennungen"]')?.tagName).toBe(
      'BUTTON',
    );
    await act(async () => root.unmount());
  });
});
