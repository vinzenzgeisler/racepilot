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
  root = createRoot(container);
  await act(async () => root!.render(<AdminEntries />));
  await flush();
  return container;
}
async function chooseEvent(id: string) {
  const select = container.querySelector('select[aria-label="Event"]')!;
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
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  await act(async () => button.click());
  await flush();
}
async function submitFilters() {
  const form = container.querySelector('.admin-filters')!;
  await act(async () => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  await flush();
}
function listCalls() {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith('/admin/entries?'));
}
function visibleEntryIds() {
  return [...container.querySelectorAll('tbody .link-button')].map((button) =>
    button.textContent?.trim(),
  );
}
function detailEntryId() {
  return container.querySelector('.admin-detail dl dd')?.textContent?.trim();
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  if (root) act(() => root?.unmount());
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
    expect(container.textContent).toContain(entryA);
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
    expect(container.textContent).toContain('Sign-in required');
    act(() => root?.unmount());
    root = undefined;
    await mount(async () => new Response('{}', { status: 403 }));
    expect(container.textContent).toContain('Access denied');
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
    await setInput('Search', 'slow');
    await submitFilters();
    await setInput('Search', 'fast');
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
    expect(detailEntryId()).toBe(entryA2);
    await act(async () => slowDetail.resolve(Response.json(itemsA[0])));
    await flush();
    expect(detailEntryId()).toBe(entryA2);
    await setSelect('Class', classA);
    await submitFilters();
    expect(listCalls().at(-1)).toContain(`classId=${classA}`);
    await chooseEvent(eventB);
    expect((labeled('Class', 'select') as HTMLSelectElement).value).toBe('');
    expect(detailEntryId()).toBeUndefined();
    expect(container.querySelector('.admin-detail textarea')).toBeNull();
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
    await setInput('Reason (required for audit)', 'Reviewed');
    await click('accepted');
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
    await setInput('Reason (required for audit)', 'Reviewed');
    await click('accepted');
    await click(entryA2);
    expect(container.querySelector('.admin-detail dd')?.textContent).toBe(
      entryA2,
    );
    await act(async () =>
      slowTransition.resolve(
        Response.json({ ...itemsA[0]!, acceptanceStatus: 'accepted' }),
      ),
    );
    await flush();
    expect(container.querySelector('.admin-detail dd')?.textContent).toBe(
      entryA2,
    );
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
    await setInput('Reason (required for audit)', 'Reviewed');
    await click('accepted');
    await setSelect('Acceptance', 'accepted');
    await submitFilters();
    await click('Next');
    expect(listCalls().at(-1)).toContain('page=2');
    expect(listCalls().at(-1)).toContain('acceptanceStatus=accepted');
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
    expect(refreshes[0]).toContain('acceptanceStatus=accepted');
  });

  it('applies search only on submit and resets to page one for filters and sorting', async () => {
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
    await click('Next');
    expect(listCalls().at(-1)).toContain('page=2');
    const callsBeforeTyping = listCalls().length;
    await setInput('Search', 'driver one');
    expect(listCalls()).toHaveLength(callsBeforeTyping);
    await setSelect('Sort', 'requestedStartNumber');
    expect(listCalls().at(-1)).toContain('page=1');
    expect(listCalls().at(-1)).toContain('sort=requestedStartNumber');
    expect(listCalls().at(-1)).not.toContain('search=');
    await submitFilters();
    expect(listCalls().at(-1)).toContain('page=1');
    expect(listCalls().at(-1)).toContain('search=driver');
    await click('Next');
    expect(listCalls().at(-1)).toContain('page=2');
    await setSelect('Sort', 'createdAt');
    expect(listCalls().at(-1)).toContain('page=1');
    expect(listCalls().at(-1)).toContain('sort=createdAt');
  });
});
