// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApplication } from './features/shell/AdminApplication.js';

const eventA = '10000000-0000-4000-8000-000000000001';
const eventB = '10000000-0000-4000-8000-000000000002';
const classA = '20000000-0000-4000-8000-000000000001';
const entryA = '30000000-0000-4000-8000-000000000001';
const entryB = '30000000-0000-4000-8000-000000000002';
const invoiceA = '90000000-0000-4000-8000-000000000001';
const invoiceB = '90000000-0000-4000-8000-000000000002';
const orgId = '40000000-0000-4000-8000-000000000001';
const events = [
  { id: eventA, name: 'Bergpreis', slug: 'bergpreis' },
  { id: eventB, name: 'Testveranstaltung', slug: 'test' },
];
const alex = {
  id: entryA,
  organizationId: orgId,
  eventId: eventA,
  classId: classA,
  registrationGroupId: '50000000-0000-4000-8000-000000000001',
  driverPersonId: '60000000-0000-4000-8000-000000000001',
  vehicleId: '70000000-0000-4000-8000-000000000001',
  verificationStatus: 'verified',
  acceptanceStatus: 'pending',
  requestedStartNumber: '42',
  priceSnapshotVersion: null,
  formSnapshotVersion: null,
  priceSnapshot: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  deletionReason: null,
  adminDetails: {
    driver: {
      name: 'Alex Driver',
      firstName: 'Alex',
      lastName: 'Driver',
      dateOfBirth: null,
      country: null,
      email: 'alex@example.test',
      emailVerified: true,
    },
    vehicle: { make: 'Porsche', model: '911', year: 2020 },
    invoice: {
      id: invoiceA,
      paymentReference: 'RF1',
      currency: 'EUR',
      totalCents: 12000,
      paidCents: 0,
      status: 'open',
    },
    eventClass: { code: 'T', name: 'Touring A' },
    startNumber: '42',
    customAnswers: [],
  },
  statusProjection: {
    dimensions: [
      {
        key: 'entry',
        value: 'pending',
        label: { de: 'Offen', en: 'Pending' },
        meaning: 'new',
        required: true,
        nextAction: {
          key: 'entry:accepted',
          label: { de: 'Zulassen', en: 'Accept' },
        },
      },
    ],
    documents: { complete: 0, total: 0 },
    hints: [],
  },
};
const nextAlex = {
  ...alex,
  id: entryB,
  adminDetails: {
    ...alex.adminDetails,
    driver: { ...alex.adminDetails.driver, name: 'Sam Driver' },
    invoice: { ...alex.adminDetails.invoice, id: invoiceB },
  },
};

let listedEntries: unknown[] = [alex];
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot> | undefined;
let narrow = false;
let previewAvailable = true;
const pending: Record<string, (response: Response) => void> = {};
function deferred(key: string) {
  return new Promise<Response>((resolve) => {
    pending[key] = resolve;
  });
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function acceptedAlex() {
  return {
    ...alex,
    acceptanceStatus: 'accepted',
    statusProjection: {
      ...alex.statusProjection,
      dimensions: alex.statusProjection.dimensions.map((dimension) =>
        dimension.key === 'entry'
          ? {
              ...dimension,
              value: 'accepted',
              label: { de: 'Zugelassen', en: 'Accepted' },
              meaning: 'done',
              nextAction: null,
            }
          : dimension,
      ),
    },
  };
}
function listFor(eventId: string, items: unknown[]) {
  return Response.json({
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
    totalPages: items.length ? 1 : 0,
  });
}
async function mount(slow: Array<'driver' | 'payment' | 'status'> = []) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/admin/session') return Response.json({ role: 'admin' });
    if (url === '/admin/events') return Response.json(events);
    const counts = /\/admin\/events\/([^/]+)\/entry-counts/.exec(url);
    if (counts)
      return Response.json(
        counts[1] === eventA
          ? { total: 1, statuses: { pending: 1 } }
          : { total: 0, statuses: {} },
      );
    if (url.endsWith('/classes'))
      return Response.json([{ id: classA, name: 'Touring A' }]);
    if (url.startsWith('/admin/entries?'))
      return url.includes(`eventId=${eventA}`)
        ? listFor(eventA, listedEntries)
        : listFor(eventB, []);
    if (url === `/admin/entries/${entryA}/driver` && method === 'PATCH')
      return slow.includes('driver') ? deferred('driver') : Response.json(alex);
    if (url === `/admin/invoices/${invoiceA}/payments`)
      return slow.includes('payment')
        ? deferred('payment')
        : Response.json({ id: 'p' }, { status: 201 });
    if (url === `/admin/entries/${entryA}/transitions`)
      return slow.includes('status')
        ? deferred('status')
        : Response.json(acceptedAlex());
    if (url === `/admin/entries/${entryA}`)
      return Response.json(
        listedEntries.find(
          (entry) => (entry as { id?: string }).id === entryA,
        ) ?? alex,
      );
    if (url === `/admin/entries/${entryB}`) return Response.json(nextAlex);
    if (url.endsWith('/messages')) return Response.json({ items: [] });
    return new Response('{}', { status: 404 });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<AdminApplication />));
  await flush();
  await flush();
}
async function click(predicate: (button: HTMLButtonElement) => boolean) {
  const button = [
    ...container.querySelectorAll<HTMLButtonElement>('button'),
  ].find(predicate);
  if (!button) throw new Error('button not found');
  await act(async () => button.click());
  await flush();
}
const byText = (text: string) => (button: HTMLButtonElement) =>
  button.textContent?.trim() === text;
async function switchEvent(id: string) {
  const selector = narrow
    ? '.nb-admin-mobile-event-picker select'
    : '.nb-admin-event-picker select';
  const select = container.querySelector<HTMLSelectElement>(selector)!;
  await act(async () => {
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
  await flush();
}
const textOf = () => container.textContent ?? '';
async function openDetailWide() {
  await click(byText('Vollständig öffnen'));
  expect(container.querySelector('.nb-detail')).not.toBeNull();
}
function expectEmptyEventView() {
  expect(container.querySelector('.nb-detail')).toBeNull();
  expect(textOf()).not.toContain('Alex Driver');
  expect(textOf()).toContain('Keine Nennungen für diese Filter.');
  expect(container.querySelector('#admin-entries-title')?.textContent).toBe(
    'Nennungen',
  );
  expect(container.querySelector('input[type="search"]')).not.toBeNull();
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  narrow = false;
  previewAvailable = true;
  listedEntries = [alex];
  window.matchMedia = ((query: string) => ({
    matches: previewAvailable && !narrow && query.includes('1680'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.restoreAllMocks();
  for (const key of Object.keys(pending)) delete pending[key];
});

describe('AdminApplication event switch and detail access', () => {
  it('opens the detail with a visible pointer action and returns to a complete empty event view', async () => {
    await mount();
    await openDetailWide();
    expect(textOf()).toContain('Alex Driver');
    await switchEvent(eventB);
    expectEmptyEventView();
    // Going back to the first event shows the list again, not the old detail.
    await switchEvent(eventA);
    expect(container.querySelector('.nb-detail')).toBeNull();
    expect(textOf()).toContain('Alex Driver');
  });

  for (const action of ['driver', 'payment', 'status'] as const)
    it(`ignores a late ${action} response after the event was switched`, async () => {
      await mount([action]);
      await openDetailWide();
      if (action === 'driver') {
        await click(byText('Bearbeiten'));
        const phone = [...container.querySelectorAll('label')]
          .find((label) => label.textContent?.startsWith('Telefon'))!
          .querySelector('input')!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )!.set!.call(phone, '+49 1');
          phone.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await click(byText('Speichern'));
      } else if (action === 'payment') {
        await click(
          (button) =>
            button.textContent === 'Zahlung erfassen' &&
            button.closest('.nb-detail-rail') !== null,
        );
        const reason =
          container.querySelector<HTMLTextAreaElement>('dialog textarea')!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value',
          )!.set!.call(reason, 'Überweisung');
          reason.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await click(
          (button) =>
            button.textContent === 'Zahlung erfassen' &&
            button.closest('dialog') !== null,
        );
      } else {
        await click(byText('Zulassen'));
        const reason =
          container.querySelector<HTMLTextAreaElement>('dialog textarea')!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value',
          )!.set!.call(reason, 'Geprüft');
          reason.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await click(byText('Status ändern'));
      }
      expect(pending[action]).toBeDefined();
      await switchEvent(eventB);
      expectEmptyEventView();
      await act(async () =>
        pending[action]!(
          action === 'payment'
            ? Response.json({ id: 'p' }, { status: 201 })
            : Response.json(
                action === 'status'
                  ? { ...alex, acceptanceStatus: 'accepted' }
                  : alex,
              ),
        ),
      );
      await flush();
      await flush();
      expectEmptyEventView();
    });

  it('opens details directly from a row on compact screens and keeps event switching available', async () => {
    narrow = true;
    await mount();
    // No preview opens by itself; the list stays the start view.
    expect(container.querySelector('.is-mobile-open')).toBeNull();
    expect(textOf()).toContain('Alex Driver');
    expect(
      container.querySelector('.nb-admin-mobile-event-picker select'),
    ).not.toBeNull();
    await click((button) => button.hasAttribute('data-entry-action'));
    expect(container.querySelector('.is-mobile-open')).toBeNull();
    expect(container.querySelector('.nb-detail')).not.toBeNull();
    await switchEvent(eventB);
    expectEmptyEventView();
    expect(container.querySelector('.is-mobile-open')).toBeNull();
  });

  it('opens the detail directly from a row in the 1280–1679 viewport band', async () => {
    previewAvailable = false;
    await mount();
    await click((button) => button.hasAttribute('data-entry-action'));
    expect(container.querySelector('.nb-detail')).not.toBeNull();
  });

  it('carries a successful preview status into the detail record and actions', async () => {
    await mount();
    expect(container.querySelector('.nb-preview-panel')?.textContent).toContain(
      'Offen',
    );
    await click(byText('Zulassen'));
    await flush();
    expect(container.querySelector('.nb-preview-panel')?.textContent).toContain(
      'Zugelassen',
    );
    expect(container.querySelector('.nb-preview-panel')?.textContent).toContain(
      'Keine weitere Statusaktion verfügbar.',
    );
    expect(container.querySelector('.nb-preview-hint')).toBeNull();
    await click(byText('Vollständig öffnen'));
    const detail = container.querySelector('.nb-detail')!;
    expect(detail.textContent).toContain('Zugelassen');
    expect(detail.textContent).not.toContain('Zulassen');
  });

  it('does not offer a destructive workflow category as the preview primary action', async () => {
    listedEntries = [
      {
        ...alex,
        acceptanceStatus: 'accepted',
        statusProjection: {
          ...alex.statusProjection,
          dimensions: alex.statusProjection.dimensions.map((dimension) =>
            dimension.key === 'entry'
              ? {
                  ...dimension,
                  nextAction: {
                    key: 'entry:withdrawn',
                    label: { de: 'Als abgesagt markieren', en: 'Withdraw' },
                  },
                }
              : dimension,
          ),
        },
      },
    ];
    await mount();

    expect(textOf()).toContain('Keine weitere Statusaktion verfügbar.');
    expect(
      [...container.querySelectorAll('.nb-preview-actions button')].some(
        (button) => button.textContent?.includes('Als abgesagt markieren'),
      ),
    ).toBe(false);
  });

  it('opens the next open entry after accepting the preview entry', async () => {
    listedEntries = [alex, nextAlex];
    await mount();
    expect(container.querySelector('.nb-preview-panel h2')?.textContent).toBe(
      'Alex Driver',
    );
    await click(byText('Zulassen'));
    await flush();
    expect(container.querySelector('.nb-preview-panel h2')?.textContent).toBe(
      'Sam Driver',
    );
  });

  it('ignores a late preview action after switching events', async () => {
    await mount(['status']);
    await click(byText('Zulassen'));
    expect(pending.status).toBeDefined();
    await switchEvent(eventB);
    await act(async () => pending.status!(Response.json(acceptedAlex())));
    await flush();
    expectEmptyEventView();
  });

  it('opens the preview on its own on a wide screen and offers both ways into the detail', async () => {
    await mount();
    expect(container.querySelector('.nb-preview-panel h2')?.textContent).toBe(
      'Alex Driver',
    );
    await click(byText('Vollständig öffnen'));
    expect(container.querySelector('.nb-detail')).not.toBeNull();
    await click(
      (button) =>
        button.textContent?.includes('Nennungen') === true &&
        button.classList.contains('nb-detail-back'),
    );
    expect(container.querySelector('.nb-detail')).toBeNull();
    await openDetailWide();
  });

  it('keeps workflow navigation in the account group but out of mobile navigation', async () => {
    narrow = true;
    await mount();

    expect(
      container.querySelector('.nb-admin-nav-group[aria-label="Konto"]')
        ?.textContent,
    ).toContain('Nennungsablauf');
    expect(
      container.querySelector('.nb-admin-mobile-nav')?.textContent,
    ).not.toContain('Nennungsablauf');
  });

  it('uses the actual next transition label and omits the acceptance hint for other actions', async () => {
    const entryWithOtherTransition = {
      ...alex,
      statusProjection: {
        ...alex.statusProjection,
        dimensions: alex.statusProjection.dimensions.map((dimension) =>
          dimension.key === 'entry'
            ? {
                ...dimension,
                nextAction: {
                  key: 'entry:waitlisted',
                  label: { de: 'Auf Warteliste setzen', en: 'Waitlist' },
                },
              }
            : dimension,
        ),
      },
    };
    listedEntries = [entryWithOtherTransition];
    await mount();

    expect(textOf()).toContain('Auf Warteliste setzen');
    expect(textOf()).not.toContain('Zulassen');
    expect(textOf()).not.toContain('Nach dem Zulassen springt');
    expect(container.querySelector('.nb-preview-hint')).toBeNull();

    await click(byText('Auf Warteliste setzen'));
    const transitionRequest = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          String(url) === `/admin/entries/${entryA}/transitions` &&
          init?.method === 'POST',
      );
    expect(JSON.parse(String(transitionRequest?.[1]?.body))).toMatchObject({
      status: 'waitlisted',
    });
  });

  it('labels status document rows by dimension and keeps the status in the chip', async () => {
    listedEntries = [
      {
        ...alex,
        statusProjection: {
          ...alex.statusProjection,
          dimensions: [
            ...alex.statusProjection.dimensions,
            {
              key: 'payment',
              value: 'open',
              label: { de: 'Offen', en: 'Open' },
              meaning: 'missing',
              required: true,
              nextAction: null,
            },
            {
              key: 'waiver',
              value: 'f_pending',
              label: { de: 'F · Ausstehend', en: 'F · Pending' },
              meaning: 'missing',
              required: true,
              nextAction: null,
            },
          ],
        },
      },
    ];
    await mount();

    const documentRows = [
      ...container.querySelectorAll('.nb-document-list li'),
    ].map((row) => row.textContent);
    expect(documentRows).toContain('StartgeldOffen');
    expect(documentRows).toContain('Haftverzicht FahrerF · Ausstehend');
  });
});
