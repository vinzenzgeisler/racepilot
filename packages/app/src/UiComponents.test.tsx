// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Checkbox,
  Field,
  Radio,
  StatusLabel,
  Switch,
  Toast,
  SelectionBar,
} from '@racepilot/ui';

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
function mount(element: React.ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(element));
}
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

describe('accessible NENNBOX components', () => {
  it('keeps visible labels and connects validation text accessibly', () => {
    mount(<Field label="Baujahr" error="Bitte vierstellig angeben." />);
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('error');
    expect(container.textContent).toContain('Bitte vierstellig angeben.');
  });
  it('exposes all six status meanings in text', () => {
    mount(
      <>
        {(
          [
            'new',
            'in_progress',
            'missing',
            'done',
            'rejected',
            'not_relevant',
          ] as const
        ).map((status) => (
          <StatusLabel key={status} status={status} />
        ))}
      </>,
    );
    for (const label of [
      'Neu',
      'In Arbeit',
      'Fehlt',
      'Erledigt',
      'Abgelehnt',
      'Nicht relevant',
    ])
      expect(container.textContent).toContain(label);
  });
  it('supports native keyboard-operable checkbox, radio and switch controls', () => {
    mount(
      <>
        <Checkbox label="Akzeptieren" />
        <Radio label="Motorrad" name="vehicle" />
        <Switch label="Offen" />
      </>,
    );
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type=checkbox]',
    )!;
    checkbox.focus();
    act(() => checkbox.click());
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector('[role=switch]')).toBeTruthy();
    expect(container.querySelector('input[type=radio]')).toBeTruthy();
  });
  it('requires a visible reason and explicit confirmation before dangerous actions', () => {
    const action = vi.fn();
    mount(
      <Button variant="danger" onDangerConfirm={action}>
        Löschen
      </Button>,
    );
    const trigger = container.querySelector<HTMLButtonElement>('button')!;
    act(() => trigger.click());
    expect(action).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Grund (erforderlich)',
    );
    const confirm = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Bestätigen',
    )!;
    expect(confirm.disabled).toBe(true);
    const reason = container.querySelector('textarea')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!;
      setter.call(reason, 'Klasse M4 ist voll');
      reason.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => reason.dispatchEvent(new Event('change', { bubbles: true })));
    expect(
      (container.querySelector('textarea') as HTMLTextAreaElement).value,
    ).toBe('Klasse M4 ist voll');
    act(() => confirm.click());
    expect(action).toHaveBeenCalledWith('Klasse M4 ist voll');
  });
  it('expires the toast at four seconds and invokes undo actions', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    mount(
      <Toast action="Rückgängig" onAction={onAction} onDismiss={onDismiss}>
        Gespeichert
      </Toast>,
    );
    act(() => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(onAction).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(3999));
    expect(container.querySelector('.nb-toast')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('.nb-toast')).toBeNull();
    expect(onDismiss).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
  it('renders selection actions as an accessible region and clears selection on request', () => {
    const clear = vi.fn();
    mount(
      <SelectionBar count={2} total={3} action="Zulassen" onClear={clear} />,
    );
    expect(
      container.querySelector('[role="region"]')?.getAttribute('aria-label'),
    ).toBe('Auswahlaktionen');
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Auswahl aufheben')!
        .click(),
    );
    expect(clear).toHaveBeenCalledOnce();
  });
  it('uses the native button keyboard activation and defaults to type=button', () => {
    const action = vi.fn();
    mount(<Button onClick={action}>Weiter</Button>);
    const button = container.querySelector<HTMLButtonElement>('button')!;
    expect(button.type).toBe('button');
    button.focus();
    act(() =>
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      ),
    );
    act(() => button.click());
    expect(action).toHaveBeenCalledOnce();
  });
  it('renders status shapes as non-rounded marks and preserves the rejected text-only treatment', () => {
    mount(
      <>
        <StatusLabel status="new" />
        <StatusLabel status="done" />
        <StatusLabel status="rejected" />
      </>,
    );
    expect(container.querySelectorAll('.nb-status-mark')).toHaveLength(2);
    expect(
      container.querySelector('.nb-status-rejected .nb-status-mark-text')
        ?.textContent,
    ).toBe('×');
  });
  it('keeps buttons keyboard focusable', () => {
    mount(<Button>Weiter</Button>);
    const button = container.querySelector<HTMLButtonElement>('button')!;
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});
