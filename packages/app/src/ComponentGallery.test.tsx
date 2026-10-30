// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ComponentGallery } from './ComponentGallery.js';

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

describe('component review gallery', () => {
  it('shows the complete primitive and app component catalogue', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<ComponentGallery />));
    for (const text of [
      'Komponenten',
      'Buttons',
      'Eingaben',
      'Status & Hinweise',
      'Icons',
      'App-Bausteine',
      'Tabelle & Menü',
      'Rückmeldung',
      'Neu',
      'In Arbeit',
      'Fehlt',
      'Erledigt',
      'Abgelehnt',
      'Nicht relevant',
    ])
      expect(container.textContent).toContain(text);
  });
  it('uses the M6 approval icon path', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<ComponentGallery />));
    const icon = container.querySelector<SVGSVGElement>(
      '.nb-icon[aria-label="approval"]',
    );
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe(
      'M5 5h3M16 5h3v16H5V5M9 13l2 2 4-4',
    );
  });
  it('opens the menu and can trigger and dismiss a confirmation toast', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<ComponentGallery />));
    const summary = container.querySelector('summary')!;
    act(() => summary.click());
    expect(summary.parentElement?.hasAttribute('open')).toBe(true);
    const show = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Bestätigung zeigen',
    )!;
    act(() => show.click());
    expect(container.textContent).toContain('Nr. 42 ist zugelassen.');
    const dismiss = container.querySelector(
      '[aria-label="Meldung schließen"]',
    )!;
    act(() => (dismiss as HTMLButtonElement).click());
    expect(container.textContent).not.toContain('Nr. 42 ist zugelassen.');
  });
  it('uses disclosure semantics and closes on Escape after moving focus back to its trigger', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<ComponentGallery />));
    const details =
      container.querySelector<HTMLDetailsElement>('details.nb-menu')!;
    const summary = details.querySelector('summary')!;
    act(() => {
      details.open = true;
    });
    const menuItem = details.querySelector('button')!;
    expect(menuItem.hasAttribute('role')).toBe(false);
    act(() => menuItem.focus());
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
  it('closes the disclosure after activating an item and restores trigger focus', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<ComponentGallery />));
    const details =
      container.querySelector<HTMLDetailsElement>('details.nb-menu')!;
    const summary = details.querySelector('summary')!;
    act(() => {
      details.open = true;
    });
    act(() => details.querySelector('button')!.click());
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});
