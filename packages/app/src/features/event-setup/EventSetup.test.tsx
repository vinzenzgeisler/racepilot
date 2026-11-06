// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { EventSetup } from './EventSetup.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));

const event = {
  id: 'event-1',
  name: 'Frühlingsfahrt',
  slug: 'fruehlingsfahrt',
  startsOn: '2027-05-01',
  endsOn: '2027-05-02',
  status: 'draft',
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
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
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
      const select = container.querySelector('select')!;
      select.value = event.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelector('select')!.value).toBe('');
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
    const eventA = { ...event, id: 'event-a', name: 'Event A' };
    const eventB = { ...event, id: 'event-b', name: 'Event B' };
    vi.mocked(adminFetch).mockImplementation((input) => {
      const url = String(input);
      if (url === '/admin/events')
        return json([
          { ...eventA, status: 'draft' },
          { ...eventB, status: 'draft' },
        ]);
      const match = url.match(/^\/admin\/events\/(event-[ab])$/);
      if (match)
        return new Promise((resolve) => pending.set(match[1]!, resolve));
      if (url.endsWith('/classes')) return json([]);
      if (url.endsWith('/pricing')) return json([]);
      if (url.endsWith('/consents')) return json({ terms: [] });
      throw new Error(`Unexpected request: ${url}`);
    });

    await render();
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = eventA.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.value = eventB.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(select.disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(true);

    await act(async () =>
      pending.get(eventB.id)?.(json(eventB) as unknown as Response),
    );
    await act(async () =>
      pending.get(eventA.id)?.(json(eventA) as unknown as Response),
    );

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
    vi.mocked(adminFetch).mockImplementation((input) => {
      const url = String(input);
      if (url === '/admin/events') return json([{ ...event, status: 'draft' }]);
      if (url === '/admin/events/event-1')
        return new Promise((resolve) => {
          finishLoad = resolve;
        });
      if (url.endsWith('/classes')) return json([]);
      if (url.endsWith('/pricing')) return json([]);
      if (url.endsWith('/consents')) return json({ terms: [] });
      throw new Error(`Unexpected request: ${url}`);
    });

    await render();
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = event.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => finishLoad(json(event) as unknown as Response));

    expect(select.value).toBe('');
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input')].find(
        (input) =>
          input.closest('label')?.querySelector('span')?.textContent === 'Name',
      )?.value,
    ).toBe('');
  });

  it('retries a partial class failure without duplicating event or class, then resumes the saved draft', async () => {
    let createdEvent = false;
    let createdClass = false;
    let eventPosts = 0;
    let classPosts = 0;
    let pricingWrites = 0;
    vi.mocked(adminFetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/admin/events' && method === 'GET')
        return json(createdEvent ? [event] : []);
      if (url === '/admin/events/event-1' && method === 'PATCH')
        return json(event);
      if (url === '/admin/events' && method === 'POST') {
        eventPosts += 1;
        createdEvent = true;
        return json(event, 201);
      }
      if (url === '/admin/events/event-1/classes' && method === 'GET')
        return json(createdClass ? [classRow] : []);
      if (url === '/admin/events/event-1/classes' && method === 'POST') {
        classPosts += 1;
        createdClass = true;
        return json({ error: 'simulated response loss' }, 500);
      }
      if (url === '/admin/events/event-1/classes/class-1' && method === 'PATCH')
        return json(classRow);
      if (url === '/admin/events/event-1/pricing' && method === 'GET')
        return json(
          pricingWrites ? [{ classId: 'class-1', baseCents: 12550 }] : [],
        );
      if (url === '/admin/events/event-1/pricing/class-1' && method === 'PUT') {
        pricingWrites += 1;
        return json({});
      }
      if (url === '/admin/events/event-1/consents' && method === 'PUT')
        return json({ terms: [] });
      if (url === '/admin/events/event-1' && method === 'GET')
        return json(event);
      if (url === '/admin/events/event-1/consents' && method === 'GET')
        return json({ terms: [] });
      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render();
    await fillValidForm();
    const form = container.querySelector('form')!;
    expect(form.checkValidity()).toBe(true);
    const saveButton = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => saveButton.click());
    expect(container.textContent).toContain('simulated response loss');
    expect(eventPosts).toBe(1);
    expect(classPosts).toBe(1);

    await act(async () => saveButton.click());
    expect(container.textContent).toContain('Entwurf gespeichert.');
    expect(eventPosts).toBe(1);
    expect(classPosts).toBe(1);
    expect(pricingWrites).toBe(1);

    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>('select')!;
      select.value = event.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input')].find(
        (input) =>
          input.closest('label')?.querySelector('span')?.textContent === 'Name',
      )?.value,
    ).toBe('Frühlingsfahrt');
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input')].find(
        (input) =>
          input.closest('label')?.querySelector('span')?.textContent ===
          'Startgeld in Euro',
      )?.value,
    ).toBe('125.50');
    expect(
      [...container.querySelectorAll<HTMLSelectElement>('select')].find(
        (select) =>
          select.closest('label')?.querySelector('span')?.textContent ===
          'Fahrzeugtyp',
      )?.value,
    ).toBe('motorcycle');
  });
});
