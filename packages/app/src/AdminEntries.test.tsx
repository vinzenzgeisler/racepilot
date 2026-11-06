// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminEntries } from './AdminEntries.js';

const eventA = '10000000-0000-4000-8000-000000000001';
const eventB = '10000000-0000-4000-8000-000000000002';
const classA = '20000000-0000-4000-8000-000000000001';
const classB = '20000000-0000-4000-8000-000000000002';
const entryA = '30000000-0000-4000-8000-000000000001';
const entryA2 = '30000000-0000-4000-8000-000000000002';
const entryB = '30000000-0000-4000-8000-000000000003';
const orgId = '40000000-0000-4000-8000-000000000001';
const event = (id: string, name: string) => ({
  id,
  organizationId: orgId,
  slug: name.toLowerCase().replaceAll(' ', '-'),
  name,
  startsOn: '2026-06-01',
  endsOn: '2026-06-01',
  status: 'open',
  registrationOpensAt: null,
  registrationClosesAt: null,
  openedAt: null,
  closedAt: null,
  archivedAt: null,
});
const entry = (id: string, eventId: string, classId: string) => ({
  id,
  organizationId: orgId,
  eventId,
  classId,
  registrationGroupId: '50000000-0000-4000-8000-000000000001',
  driverPersonId: '60000000-0000-4000-8000-000000000001',
  vehicleId: '70000000-0000-4000-8000-000000000001',
  verificationStatus: 'unverified',
  acceptanceStatus: 'pending',
  requestedStartNumber: null,
  priceSnapshotVersion: null,
  formSnapshotVersion: null,
  priceSnapshot: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  deletionReason: null,
  adminDetails: {
    driver: {
      name: id === entryA ? 'Alex Driver' : 'Casey Driver',
      firstName: id === entryA ? 'Alex' : 'Casey',
      lastName: 'Driver',
      dateOfBirth: '1990-01-01',
      country: 'DE',
      email: 'family@example.test',
      emailVerified: true,
    },
    vehicle: { make: 'Porsche', model: '911', year: 2020 },
    eventClass: { code: 'TOUR', name: 'Touring A' },
    startNumber: id === entryA ? '42' : null,
    customAnswers: [
      {
        key: 'club_name',
        label: 'Verein',
        value: 'MSC Beispielstadt',
        fileDownloadUrl: null,
      },
      {
        key: 'vehicle_photo',
        label: 'Fahrzeugbild',
        value: null,
        fileDownloadUrl: `/admin/events/${eventA}/registration-form-uploads/80000000-0000-4000-8000-000000000001`,
      },
    ],
  },
  statusProjection: {
    dimensions: [
      {
        key: 'entry',
        value: 'pending',
        label: { de: 'Offen', en: 'Pending' },
        meaning: 'new',
        required: true,
        nextAction: { key: 'accept', label: { de: 'Prüfen', en: 'Review' } },
      },
      {
        key: 'payment',
        value: 'open',
        label: { de: 'Offen', en: 'Open' },
        meaning: 'in_progress',
        required: true,
        nextAction: null,
      },
    ],
    documents: { complete: 1, total: 3 },
    hints: [],
  },
});
const itemsA = [entry(entryA, eventA, classA), entry(entryA2, eventA, classA)];
const itemB = entry(entryB, eventB, classB);
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot> | undefined;
let fetchMock: {
  mock: { calls: Array<[unknown, RequestInit | undefined]> };
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function listResponse(
  items: ReturnType<typeof entry>[],
  page = 1,
  totalPages = 1,
) {
  return Response.json({
    items,
    page,
    pageSize: 25,
    total: items.length,
    totalPages,
  });
}
function eventList() {
  return Response.json([
    event(eventA, 'Spring Rally'),
    event(eventB, 'Summer Rally'),
  ]);
}
function classesFor(id: string) {
  return Response.json([
    { id, name: id === classA ? 'Touring A' : 'Touring B' },
  ]);
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function mount(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
) {
  fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) =>
      fetchImpl(String(input), init),
    ) as unknown as typeof fetchMock;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<AdminEntries />));
  await flush();
  return container;
}
async function chooseEvent(id: string) {
  const select = container.querySelector('select[aria-label="Veranstaltung"]')!;
  await act(async () => {
    (select as HTMLSelectElement).value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}
function labeled(label: string, selector: string) {
  const node = [...container.querySelectorAll('label')].find((item) =>
    item.textContent?.trim().startsWith(label),
  );
  return node?.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
}
async function setSelect(label: string, value: string) {
  const select = labeled(label, 'select');
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function setInput(label: string, value: string) {
  const input = labeled(label, 'input,textarea') as
    HTMLInputElement | HTMLTextAreaElement;
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function click(text: string) {
  const button =
    container.querySelector<HTMLButtonElement>(
      `[data-entry-action="${text}"]`,
    ) ??
    [
      ...container.querySelectorAll<HTMLButtonElement>('.admin-actions button'),
    ].find((item) => item.textContent?.includes(text) ?? false) ??
    [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.includes(text) ?? false,
    );
  if (!button) throw new Error(`Button not found: ${text}`);
  await act(async () => button.click());
  await flush();
}
async function submitFilters() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 220));
  });
  await flush();
}

function listCalls() {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith('/admin/entries?'));
}
function visibleEntryIds() {
  return [...container.querySelectorAll('tbody [data-entry-action]')].map(
    (button) => button.getAttribute('data-entry-action'),
  );
}
async function openDetail() {
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    ),
  );
  await flush();
  expect(container.querySelector('.admin-detail-view')).not.toBeNull();
}
async function closeDetail() {
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.nb-detail-back')!.click(),
  );
  await flush();
  expect(container.querySelector('.admin-detail-view')).toBeNull();
}
function detailEntryId() {
  return container
    .querySelector('.nb-detail-head-title h2')
    ?.textContent?.split(' · ')[0]
    ?.trim();
}
/** Status changes go through the reason dialog of the action rail. */
async function changeStatus(action: string, reason = 'Reviewed') {
  await click(action);
  await setInput('Begründung', reason);
  await click('Status ändern');
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.restoreAllMocks();
});

describe('AdminEntries', () => {
  it('loads organization-scoped events and requests server-paginated entries with selected filters', async () => {
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      expect(init?.credentials).toBe('same-origin');
      throw new Error(`Unexpected request ${url}`);
    });
    await chooseEvent(eventA);
    expect(container.textContent).toContain('Spring Rally');
    expect(container.textContent).toContain('Alex Driver');
    expect(listCalls().some((url) => url.includes(`eventId=${eventA}`))).toBe(
      true,
    );
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => init?.credentials === 'same-origin',
      ),
    ).toBe(true);
  });

  it('renders distinct 401 and 403 states without public-data fallback', async () => {
    await mount(async () => new Response('{}', { status: 401 }));
    expect(container.textContent).toContain('Anmeldung erforderlich');
    act(() => root?.unmount());
    root = undefined;
    await mount(async () => new Response('{}', { status: 403 }));
    expect(container.textContent).toContain('Zugriff verweigert');
  });

  it('ignores a slower prior-event list response after switching events', async () => {
    const slowA = deferred<Response>();
    await mount(async (url) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith(`/events/${eventA}/classes`)) return classesFor(classA);
      if (url.endsWith(`/events/${eventB}/classes`)) return classesFor(classB);
      if (
        url.startsWith('/admin/entries?') &&
        url.includes(`eventId=${eventA}`)
      )
        return slowA.promise;
      if (
        url.startsWith('/admin/entries?') &&
        url.includes(`eventId=${eventB}`)
      )
        return listResponse([itemB]);
      throw new Error(`Unexpected request ${url}`);
    });
    await chooseEvent(eventA);
    await chooseEvent(eventB);
    expect(visibleEntryIds()).toEqual([entryB]);
    await act(async () => slowA.resolve(listResponse(itemsA)));
    await flush();
    expect(visibleEntryIds()).toEqual([entryB]);
  });

  it('ignores a slower response for a superseded filter query', async () => {
    const slowSearch = deferred<Response>();
    await mount(async (url) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) {
        const search = new URL(url, 'http://localhost').searchParams.get(
          'search',
        );
        if (search === 'slow') return slowSearch.promise;
        if (search === 'fast') return listResponse([itemsA[1]!]);
        return listResponse(itemsA);
      }
      throw new Error(`Unexpected request ${url}`);
    });
    await chooseEvent(eventA);
    await setInput('Suche', 'slow');
    await submitFilters();
    await setInput('Suche', 'fast');
    await submitFilters();
    expect(visibleEntryIds()).toEqual([entryA2]);
    await act(async () => slowSearch.resolve(listResponse([itemsA[0]!])));
    await flush();
    expect(visibleEntryIds()).toEqual([entryA2]);
  });

  it('ignores delayed details when selection changes and resets class/detail state on event switch', async () => {
    const slowDetail = deferred<Response>();
    await mount(async (url) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith(`/events/${eventA}/classes`)) return classesFor(classA);
      if (url.endsWith(`/events/${eventB}/classes`)) return classesFor(classB);
      if (
        url.startsWith('/admin/entries?') &&
        url.includes(`eventId=${eventA}`)
      )
        return listResponse(itemsA);
      if (
        url.startsWith('/admin/entries?') &&
        url.includes(`eventId=${eventB}`)
      )
        return listResponse([itemB]);
      if (url === `/admin/entries/${entryA}`) return slowDetail.promise;
      if (url === `/admin/entries/${entryA2}`) return Response.json(itemsA[1]);
      if (url === `/admin/entries/${entryB}`) return Response.json(itemB);
      throw new Error(`Unexpected request ${url}`);
    });
    await chooseEvent(eventA);
    await click(entryA);
    await click(entryA2);
    await openDetail();
    expect(detailEntryId()).toBe('Casey Driver');
    await act(async () => slowDetail.resolve(Response.json(itemsA[0])));
    await flush();
    expect(detailEntryId()).toBe('Casey Driver');
    await closeDetail();
    await setSelect('Klasse', classA);
    await submitFilters();
    expect(listCalls().at(-1)).toContain(`classId=${classA}`);
    await chooseEvent(eventB);
    expect((labeled('Klasse', 'select') as HTMLSelectElement).value).toBe('');
    expect(detailEntryId()).toBeUndefined();
    expect(container.querySelector('.admin-detail-view textarea')).toBeNull();
    await flush();
    expect(listCalls().at(-1)).toContain(`eventId=${eventB}`);
    expect(listCalls().at(-1)).not.toContain('classId=');
  });

  it('does not let an in-flight transition restore a prior event detail or list', async () => {
    const slowTransition = deferred<Response>();
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith(`/events/${eventA}/classes`)) return classesFor(classA);
      if (url.endsWith(`/events/${eventB}/classes`)) return classesFor(classB);
      if (
        url.startsWith('/admin/entries?') &&
        url.includes(`eventId=${eventA}`)
      )
        return listResponse(itemsA);
      if (
        url.startsWith('/admin/entries?') &&
        url.includes(`eventId=${eventB}`)
      )
        return listResponse([itemB]);
      if (url === `/admin/entries/${entryA}`) return Response.json(itemsA[0]);
      if (
        url === `/admin/entries/${entryA}/transitions` &&
        init?.method === 'POST'
      )
        return slowTransition.promise;
      throw new Error(`Unexpected request ${url}`);
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    await changeStatus('Zulassen');
    await chooseEvent(eventB);
    expect(visibleEntryIds()).toEqual([entryB]);
    await act(async () =>
      slowTransition.resolve(
        Response.json({ ...itemsA[0], acceptanceStatus: 'accepted' }),
      ),
    );
    await flush();
    expect(visibleEntryIds()).toEqual([entryB]);
    expect(detailEntryId()).toBeUndefined();
  });

  it('does not let a transition overwrite a different entry selected before it resolves', async () => {
    const slowTransition = deferred<Response>();
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith(`/events/${eventA}/classes`)) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      if (url === `/admin/entries/${entryA}`) return Response.json(itemsA[0]);
      if (url === `/admin/entries/${entryA2}`) return Response.json(itemsA[1]);
      if (
        url === `/admin/entries/${entryA}/transitions` &&
        init?.method === 'POST'
      )
        return slowTransition.promise;
      throw new Error(`Unexpected request ${url}`);
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    await changeStatus('Zulassen');
    await closeDetail();
    await click(entryA2);
    await openDetail();
    expect(detailEntryId()).toBe('Casey Driver');
    await act(async () =>
      slowTransition.resolve(
        Response.json({ ...itemsA[0]!, acceptanceStatus: 'accepted' }),
      ),
    );
    await flush();
    expect(detailEntryId()).toBe('Casey Driver');
  });

  it('refreshes after a pending transition using the latest applied query and page', async () => {
    const slowTransition = deferred<Response>();
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith(`/events/${eventA}/classes`)) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) {
        const params = new URL(url, 'http://localhost').searchParams;
        return listResponse(itemsA, Number(params.get('page')), 2);
      }
      if (url === `/admin/entries/${entryA}`) return Response.json(itemsA[0]);
      if (
        url === `/admin/entries/${entryA}/transitions` &&
        init?.method === 'POST'
      )
        return slowTransition.promise;
      throw new Error(`Unexpected request ${url}`);
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    await changeStatus('Zulassen');
    await closeDetail();
    await setSelect('Klasse', classA);
    await submitFilters();
    await click('Weiter');
    expect(listCalls().at(-1)).toContain('page=2');
    expect(listCalls().at(-1)).toContain(`classId=${classA}`);
    const callsBeforeTransitionResolves = listCalls().length;

    await act(async () =>
      slowTransition.resolve(
        Response.json({ ...itemsA[0]!, acceptanceStatus: 'accepted' }),
      ),
    );
    await flush();

    const refreshes = listCalls().slice(callsBeforeTransitionResolves);
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]).toContain('page=2');
    expect(refreshes[0]).toContain(`classId=${classA}`);
  });

  it('renders entry details instead of IDs and one working row menu', async () => {
    await mount(async (url) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    const firstRow = container.querySelector('tbody tr')!;
    expect(firstRow.textContent).toContain('Alex Driver');
    expect(firstRow.textContent).toContain('Porsche 911');
    expect(firstRow.textContent).toContain('Touring A');
    expect(firstRow.textContent).toContain('42');
    expect(firstRow.textContent).not.toContain(entryA);
    expect(firstRow.querySelectorAll('.nb-entry-list-open')).toHaveLength(1);
    expect(
      firstRow.querySelector('.nb-menu summary')?.getAttribute('aria-label'),
    ).toBe('Weitere Aktionen für Alex Driver');
    expect(
      firstRow.querySelectorAll('.nb-menu [role=menuitem]').length,
    ).toBeGreaterThan(0);
    expect(firstRow.querySelector('.nb-entry-list-image-empty')).not.toBeNull();
  });

  it('shows selected count and opens or closes detail with Enter and Escape', async () => {
    await mount(async (url) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      if (url === `/admin/entries/${entryA}`) return Response.json(itemsA[0]);
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    const checkbox = container.querySelector(
      'tbody input[type="checkbox"]',
    ) as HTMLInputElement;
    await act(async () => {
      checkbox.click();
    });
    expect(container.querySelector('.nb-selection')?.textContent).toContain(
      '1 von 2',
    );
    const action = container.querySelector(
      `[data-entry-action="${entryA}"]`,
    ) as HTMLButtonElement;
    await act(async () => action.click());
    await flush();
    await act(async () => action.focus());
    await act(async () =>
      action.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      ),
    );
    await flush();
    expect(container.querySelector('.admin-detail-view')).not.toBeNull();
    expect(
      container.querySelector('.admin-detail-view')?.textContent,
    ).toContain('MSC Beispielstadt');
    const download = container.querySelector(
      '.admin-detail-view a[href*="registration-form-uploads"]',
    ) as HTMLAnchorElement | null;
    expect(download?.textContent).toBe('Datei herunterladen');
    expect(download?.getAttribute('href')).toContain(eventA);
    expect(
      container.querySelector('.admin-detail-view')?.textContent,
    ).not.toContain('uploadToken');
    expect(
      container.querySelector('.admin-detail-view')?.getAttribute('aria-label'),
    ).toBe('Nennung im Detail');
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(container.querySelector('.admin-detail-view')).toBeNull();
  });

  it('uses the configured accepted status key for bulk acceptance', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Reviewed');
    const transitionBodies: Array<{ status: string }> = [];
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      if (url.endsWith('/registration-workflow'))
        return Response.json({
          workflow: {
            statuses: [
              {
                key: 'confirmed',
                labels: { de: 'Bestätigt', en: 'Confirmed' },
                color: '#15803d',
                category: 'accepted',
              },
            ],
            transitions: [
              { from: 'pending', to: 'confirmed', reasonRequired: true },
            ],
          },
        });
      if (url.endsWith('/transitions') && init?.method === 'POST') {
        transitionBodies.push(
          JSON.parse(String(init.body)) as { status: string },
        );
        return Response.json(itemsA[0]);
      }
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    const checkbox = container.querySelector(
      'tbody input[type="checkbox"]',
    ) as HTMLInputElement;
    await act(async () => checkbox.click());
    await flush();
    const accept = [...container.querySelectorAll('.nb-selection button')].find(
      (button) => button.textContent?.includes('Zulassen'),
    ) as HTMLButtonElement;
    expect(accept.disabled).toBe(false);
    await act(async () => accept.click());
    await flush();
    expect(transitionBodies).toHaveLength(1);
    expect(transitionBodies[0]?.status).toBe('confirmed');
  });

  it('keeps the changed entry open after acceptance using the configured accepted key', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Reviewed');
    const second = entry(entryA2, eventA, classA);
    const updatedFirst = { ...itemsA[0]!, acceptanceStatus: 'confirmed' };
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      if (url.endsWith('/registration-workflow'))
        return Response.json({
          workflow: {
            statuses: [
              {
                key: 'pending',
                labels: { de: 'Offen', en: 'Pending' },
                color: '#777',
                category: 'pending',
              },
              {
                key: 'confirmed',
                labels: { de: 'Bestätigt', en: 'Confirmed' },
                color: '#070',
                category: 'accepted',
              },
            ],
            transitions: [
              { from: 'pending', to: 'confirmed', reasonRequired: true },
            ],
          },
        });
      if (url === `/admin/entries/${entryA}`) return Response.json(itemsA[0]);
      if (url === `/admin/entries/${entryA2}`) return Response.json(second);
      if (
        url === `/admin/entries/${entryA}/transitions` &&
        init?.method === 'POST'
      )
        return Response.json(updatedFirst);
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    await changeStatus('Zulassen');
    // The detail stays on the changed entry so its history can be checked.
    expect(detailEntryId()).toBe('Alex Driver');
    expect(second.id).toBe(entryA2);
  });

  it('keeps the accepted entry selected when no next pending entry exists', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Reviewed');
    const onlyEntry = [itemsA[0]!];
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(onlyEntry);
      if (url.endsWith('/registration-workflow'))
        return Response.json({
          workflow: {
            statuses: [
              {
                key: 'pending',
                labels: { de: 'Offen', en: 'Pending' },
                color: '#777',
                category: 'pending',
              },
              {
                key: 'confirmed',
                labels: { de: 'Bestätigt', en: 'Confirmed' },
                color: '#070',
                category: 'accepted',
              },
            ],
            transitions: [
              { from: 'pending', to: 'confirmed', reasonRequired: true },
            ],
          },
        });
      if (url === `/admin/entries/${entryA}`)
        return Response.json(onlyEntry[0]);
      if (
        url === `/admin/entries/${entryA}/transitions` &&
        init?.method === 'POST'
      )
        return Response.json({
          ...onlyEntry[0],
          acceptanceStatus: 'confirmed',
        });
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    await changeStatus('Zulassen');
    expect(detailEntryId()).toBe('Alex Driver');
  });

  it('clears bulk selection when changing pages, filters, and events', async () => {
    await mount(async (url) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) {
        const params = new URL(url, 'http://localhost').searchParams;
        return listResponse(
          params.get('eventId') === eventB ? [itemB] : itemsA,
          Number(params.get('page')),
          2,
        );
      }
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    const selectFirst = async () => {
      const checkbox = container.querySelector(
        'tbody input[type="checkbox"]',
      ) as HTMLInputElement;
      await act(async () => checkbox.click());
      await flush();
    };
    await selectFirst();
    expect(container.querySelector('.nb-selection')?.textContent).toContain(
      '1 von',
    );
    await setInput('Suche', 'Alex');
    await submitFilters();
    expect(container.querySelector('.nb-selection')).toBeNull();
    await selectFirst();
    await click('Weiter');
    expect(container.querySelector('.nb-selection')).toBeNull();
    await selectFirst();
    await chooseEvent(eventB);
    expect(container.querySelector('.nb-selection')).toBeNull();
    expect(
      (
        container.querySelector(
          'tbody input[type="checkbox"]',
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it('shows only currently possible actions in the detail panel', async () => {
    await mount(async (url) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      if (url === `/admin/entries/${entryA}`)
        return Response.json({ ...itemsA[0], verificationStatus: 'verified' });
      if (url.endsWith('/registration-workflow'))
        return Response.json({
          workflow: {
            statuses: [
              {
                key: 'accepted',
                labels: { de: 'Angenommen', en: 'Accepted' },
                color: '#15803d',
                category: 'accepted',
              },
            ],
            transitions: [
              { from: 'pending', to: 'accepted', reasonRequired: true },
            ],
          },
        });
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    await act(async () =>
      (
        container.querySelector(
          `[data-entry-action="${entryA}"]`,
        ) as HTMLButtonElement
      ).click(),
    );
    await flush();
    await openDetail();
    const actions = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '.nb-detail-rail button',
      ),
    ];
    expect(actions).toHaveLength(1);
    expect(actions[0]?.textContent).toContain('Zulassen');
    expect(
      actions.some((button) =>
        button.textContent?.includes('E-Mail verifizieren'),
      ),
    ).toBe(false);
  });

  it('applies search immediately and resets to page one for filters and sorting', async () => {
    await mount(async (url) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) {
        const params = new URL(url, 'http://localhost').searchParams;
        return listResponse(itemsA, Number(params.get('page')), 2);
      }
      throw new Error(`Unexpected request ${url}`);
    });
    await chooseEvent(eventA);
    await click('Weiter');
    expect(listCalls().at(-1)).toContain('page=2');
    const callsBeforeTyping = listCalls().length;
    await setInput('Suche', 'driver one');
    expect(listCalls()).toHaveLength(callsBeforeTyping);
    await setSelect('Sort', 'requestedStartNumber');
    expect(listCalls().at(-1)).toContain('page=1');
    expect(listCalls().at(-1)).toContain('sort=requestedStartNumber');
    expect(listCalls().at(-1)).not.toContain('search=');
    await submitFilters();
    expect(listCalls().at(-1)).toContain('page=1');
    expect(listCalls().at(-1)).toContain('search=driver');
    await click('Weiter');
    expect(listCalls().at(-1)).toContain('page=2');
    await setSelect('Sort', 'createdAt');
    expect(listCalls().at(-1)).toContain('page=1');
    expect(listCalls().at(-1)).toContain('sort=createdAt');
  });

  it('edits driver data and records a payment from the detail, refreshing the entry', async () => {
    const invoice = {
      id: '90000000-0000-4000-8000-000000000001',
      paymentReference: 'RF1',
      currency: 'EUR',
      totalCents: 12000,
      paidCents: 0,
      status: 'open',
    };
    const withInvoice = {
      ...itemsA[0]!,
      adminDetails: { ...itemsA[0]!.adminDetails, invoice },
    };
    const bodies: Record<string, unknown> = {};
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      if (
        url === `/admin/entries/${entryA}/driver` &&
        init?.method === 'PATCH'
      ) {
        bodies.driver = JSON.parse(String(init.body));
        return Response.json({
          ...withInvoice,
          adminDetails: {
            ...withInvoice.adminDetails,
            driver: { ...withInvoice.adminDetails.driver, phone: '+49 1' },
          },
        });
      }
      if (url === `/admin/invoices/${invoice.id}/payments`) {
        bodies.payment = JSON.parse(String(init?.body));
        return Response.json({ id: 'p1' }, { status: 201 });
      }
      if (url === `/admin/entries/${entryA}`)
        return Response.json(
          bodies.payment
            ? {
                ...withInvoice,
                adminDetails: {
                  ...withInvoice.adminDetails,
                  invoice: {
                    ...invoice,
                    paidCents: 5000,
                    status: 'partially_paid',
                  },
                },
              }
            : withInvoice,
        );
      if (url === `/admin/entries/${entryA}/messages`)
        return Response.json({ items: [] });
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    expect(container.textContent).toContain('nicht angegeben');
    await click('Bearbeiten');
    await setInput('Telefon', ' +49 1 ');
    await click('Speichern');
    expect(bodies.driver).toEqual({ phone: '+49 1' });
    expect(container.textContent).toContain('+49 1');
    await click('Zahlung erfassen');
    await setInput('Betrag', '50,00');
    await setInput('Begründung', 'Überweisung');
    const confirm = [
      ...container.querySelectorAll<HTMLButtonElement>('dialog button'),
    ].find((button) => button.textContent === 'Zahlung erfassen')!;
    await act(async () => confirm.click());
    await flush();
    expect(bodies.payment).toEqual({
      amountCents: 5000,
      reason: 'Überweisung',
    });
    expect(container.querySelector('.nb-detail-rail')?.textContent).toContain(
      'Zahlung erfassen',
    );
  });

  it('keeps multi-part names intact when only the phone number changes', async () => {
    const hans = {
      ...itemsA[0]!,
      adminDetails: {
        ...itemsA[0]!.adminDetails,
        driver: {
          ...itemsA[0]!.adminDetails.driver,
          name: 'Hans Peter von Berg',
          firstName: 'Hans Peter',
          lastName: 'von Berg',
        },
      },
    };
    let body: unknown;
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse([hans]);
      if (url === `/admin/entries/${entryA}/driver`) {
        body = JSON.parse(String(init?.body));
        return Response.json(hans);
      }
      if (url === `/admin/entries/${entryA}`) return Response.json(hans);
      if (url.endsWith('/messages')) return Response.json({ items: [] });
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    await click('Bearbeiten');
    expect((labeled('Vorname', 'input') as HTMLInputElement).value).toBe(
      'Hans Peter',
    );
    expect((labeled('Nachname', 'input') as HTMLInputElement).value).toBe(
      'von Berg',
    );
    await setInput('Telefon', '+49 5');
    await click('Speichern');
    expect(body).toEqual({ phone: '+49 5' });
  });

  it('shows a rejected or failed status change inside the open dialog', async () => {
    let status = 403;
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      if (url === `/admin/entries/${entryA}`) return Response.json(itemsA[0]);
      if (url.endsWith('/messages')) return Response.json({ items: [] });
      if (
        url === `/admin/entries/${entryA}/transitions` &&
        init?.method === 'POST'
      )
        return new Response('{}', { status });
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    await changeStatus('Zulassen');
    const alerts = () =>
      [...container.querySelectorAll('[role="alert"]')].map((node) => ({
        text: node.textContent,
        inDialog: node.closest('dialog') !== null,
      }));
    expect(alerts()).toEqual([
      {
        text: 'Du darfst den Status dieser Nennung nicht ändern.',
        inDialog: true,
      },
    ]);
    // A second attempt replaces the message instead of stacking another one behind the dialog.
    status = 500;
    await click('Status ändern');
    expect(alerts()).toEqual([
      { text: 'Die Statusänderung wurde abgelehnt.', inDialog: true },
    ]);
  });

  it('drops a late edit response after the detail was left for another entry', async () => {
    const slowSave = deferred<Response>();
    await mount(async (url, init) => {
      if (url === '/admin/events') return eventList();
      if (url.endsWith('/classes')) return classesFor(classA);
      if (url.startsWith('/admin/entries?')) return listResponse(itemsA);
      if (url === `/admin/entries/${entryA}/driver` && init?.method === 'PATCH')
        return slowSave.promise;
      if (url === `/admin/entries/${entryA}`) return Response.json(itemsA[0]);
      if (url === `/admin/entries/${entryA2}`) return Response.json(itemsA[1]);
      if (url.endsWith('/messages')) return Response.json({ items: [] });
      return new Response('{}', { status: 404 });
    });
    await chooseEvent(eventA);
    await click(entryA);
    await openDetail();
    await click('Bearbeiten');
    await setInput('Telefon', '+49 9');
    await click('Speichern');
    await closeDetail();
    await click(entryA2);
    await openDetail();
    expect(detailEntryId()).toBe('Casey Driver');
    await act(async () => slowSave.resolve(Response.json(itemsA[0])));
    await flush();
    expect(detailEntryId()).toBe('Casey Driver');
  });
});
