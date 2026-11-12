// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { EventSetup } from './EventSetup.js';

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));

const event = {
  id: 'event-1',
  name: 'Frühlingsfahrt',
  slug: 'fruehlingsfahrt',
  startsOn: '2027-05-01',
  endsOn: '2027-05-02',
  status: 'draft',
};
const price = {
  classId: 'class-1',
  baseCents: 12550,
  additionalEntryAdjustmentCents: 0,
  earlyBirdDeadline: null,
  earlyBirdDiscountCents: 0,
};
const classRow = {
  id: 'class-1',
  name: 'Touring',
  code: 'TOUR',
  vehicleType: 'motorcycle',
  sortOrder: 0,
  maxParticipants: null,
  closed: false,
};
let root: Root;
let container: HTMLDivElement;

function json(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<EventSetup onCreated={vi.fn()} />);
  });
}

async function fillValidForm() {
  const fields: Array<[string, string]> = [
    ['Name', 'Frühlingsfahrt'],
    ['Link-Kürzel', 'fruehlingsfahrt'],
    ['Beginn', '2027-05-01'],
    ['Ende', '2027-05-02'],
    ['Klassenname', 'Touring'],
    ['Kürzel', 'TOUR'],
    ['Startgeld in Euro', '125,50'],
  ];
  for (const [label, value] of fields) {
    await act(async () => {
      const input = [
        ...container.querySelectorAll<HTMLInputElement>('input'),
      ].find(
        (candidate) =>
          candidate.closest('label')?.querySelector('span')?.textContent ===
          label,
      );
      if (!input) throw new Error(`Missing input ${label}`);
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set?.call(input, value);
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value,
        }),
      );
    });
  }
}

describe('event setup', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not bind a selected event id when loading the draft fails', async () => {
    vi.mocked(adminFetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/admin/events' && method === 'GET')
        return json([{ ...event, status: 'draft' }]);
      if (url === '/admin/events/event-1' && method === 'GET')
        return json({ error: 'load failed' }, 500);
      if (url.endsWith('/classes') || url.endsWith('/pricing')) return json([]);
      if (url.endsWith('/consents')) return json({ terms: [] });
      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render();
    await act(async () => {
      const select = required(container.querySelector('select'), 'select');
      select.value = event.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(required(container.querySelector('select'), 'select').value).toBe(
      '',
    );
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input')].find(
        (input) =>
          input.closest('label')?.querySelector('span')?.textContent === 'Name',
      )?.value,
    ).toBe('');
    expect(container.textContent).toContain('load failed');
  });

  it('keeps the latest selected draft when resume requests resolve in reverse order', async () => {
    const pending = new Map<string, (response: Response) => void>();
    const signals = new Map<string, AbortSignal>();
    const eventA = { ...event, id: 'event-a', name: 'Event A' };
    const eventB = { ...event, id: 'event-b', name: 'Event B' };
    vi.mocked(adminFetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url === '/admin/events')
        return json([
          { ...eventA, status: 'draft' },
          { ...eventB, status: 'draft' },
        ]);
      const loadedId = url.match(/^\/admin\/events\/(event-[ab])$/)?.[1];
      if (loadedId) {
        if (init?.signal instanceof AbortSignal)
          signals.set(loadedId, init.signal);
        return new Promise((resolve) => pending.set(loadedId, resolve));
      }
      if (url.endsWith('/classes')) return json([]);
      if (url.endsWith('/pricing')) return json([]);
      if (url.endsWith('/consents')) return json({ terms: [] });
      throw new Error(`Unexpected request: ${url}`);
    });

    await render();
    const select = required(container.querySelector('select'), 'select');
    await act(async () => {
      select.value = eventA.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.value = eventB.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(signals.get(eventA.id)?.aborted).toBe(true);
    expect(select.disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(true);

    await act(async () => pending.get(eventB.id)?.(await json(eventB)));
    await act(async () => pending.get(eventA.id)?.(await json(eventA)));

    expect(
      [...container.querySelectorAll<HTMLInputElement>('input')].find(
        (input) =>
          input.closest('label')?.querySelector('span')?.textContent === 'Name',
      )?.value,
    ).toBe('Event B');
    expect(select.value).toBe(eventB.id);
  });

  it('does not apply a pending resume after reset', async () => {
    let finishLoad!: (response: Response) => void;
    const loadSignal: { current: AbortSignal | null } = { current: null };
    vi.mocked(adminFetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url === '/admin/events') return json([{ ...event, status: 'draft' }]);
      if (url === '/admin/events/event-1') {
        if (init?.signal instanceof AbortSignal)
          loadSignal.current = init.signal;
        return new Promise((resolve) => {
          finishLoad = resolve;
        });
      }
      if (url.endsWith('/classes')) return json([]);
      if (url.endsWith('/pricing')) return json([]);
      if (url.endsWith('/consents')) return json({ terms: [] });
      throw new Error(`Unexpected request: ${url}`);
    });

    await render();
    const select = required(container.querySelector('select'), 'select');
    await act(async () => {
      select.value = event.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(loadSignal.current?.aborted).toBe(true);
    await act(async () => finishLoad(await json(event)));

    expect(select.value).toBe('');
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input')].find(
        (input) =>
          input.closest('label')?.querySelector('span')?.textContent === 'Name',
      )?.value,
    ).toBe('');
  });

  it('recovers an atomic setup after a lost response without creating duplicate resources', async () => {
    let setupCalls = 0;
    let eventPatches = 0;
    let classPatches = 0;
    let pricingWrites = 0;
    let termsWrites = 0;
    vi.mocked(adminFetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/admin/events' && method === 'GET') return json([event]);
      if (url === '/admin/events/setup' && method === 'POST') {
        setupCalls += 1;
        throw new Error('simulated response loss');
      }
      if (url === '/admin/events/event-1' && method === 'GET')
        return json(event);
      if (url === '/admin/events/event-1' && method === 'PATCH') {
        eventPatches += 1;
        return json(event);
      }
      if (url.endsWith('/classes') && method === 'GET') return json([classRow]);
      if (url.endsWith('/classes/class-1') && method === 'PATCH') {
        classPatches += 1;
        return json(classRow);
      }
      if (url.endsWith('/pricing') && method === 'GET') return json([price]);
      if (url.endsWith('/pricing/class-1') && method === 'PUT') {
        pricingWrites += 1;
        return json(price);
      }
      if (url.endsWith('/consents') && method === 'GET')
        return json({ terms: [] });
      if (url.endsWith('/consents') && method === 'PUT') {
        termsWrites += 1;
        return json({ terms: [] });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render();
    await fillValidForm();
    const form = required(container.querySelector('form'), 'form');
    expect(form.checkValidity()).toBe(true);
    const saveButton = required(
      container.querySelector<HTMLButtonElement>('button[type="submit"]'),
      'save button',
    );
    await act(async () => saveButton.click());
    expect(container.textContent).toContain('Antwort ging verloren');
    expect(setupCalls).toBe(1);

    await act(async () => saveButton.click());
    expect(container.textContent).toContain('Entwurf gespeichert.');
    expect(setupCalls).toBe(1);
    expect(eventPatches).toBe(1);
    expect(classPatches).toBe(1);
    expect(pricingWrites).toBe(0);
    expect(termsWrites).toBe(0);
  });
});
