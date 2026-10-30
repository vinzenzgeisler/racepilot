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
  it('requires confirmation for dangerous actions and respects cancellation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const action = vi.fn();
    mount(
      <Button variant="danger" confirmText="Wirklich löschen?" onClick={action}>
        Löschen
      </Button>,
    );
    const button = container.querySelector<HTMLButtonElement>('button')!;
    act(() => button.click());
    expect(confirm).toHaveBeenCalledWith('Wirklich löschen?');
    expect(action).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    act(() => button.click());
    expect(action).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });
  it('keeps buttons keyboard focusable', () => {
    mount(<Button>Weiter</Button>);
    const button = container.querySelector<HTMLButtonElement>('button')!;
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});
