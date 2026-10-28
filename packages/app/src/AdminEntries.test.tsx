// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminEntries } from './AdminEntries.js';

const eventId = '10000000-0000-4000-8000-000000000001';
const classId = '20000000-0000-4000-8000-000000000001';
const entryId = '30000000-0000-4000-8000-000000000001';
const event = {
  id: eventId,
  organizationId: eventId,
  slug: 'rally',
  name: 'Spring Rally',
  startsOn: '2026-06-01',
  endsOn: '2026-06-01',
  status: 'open',
  registrationOpensAt: null,
  registrationClosesAt: null,
  openedAt: null,
  closedAt: null,
  archivedAt: null,
};
const entry = {
  id: entryId,
  organizationId: eventId,
  eventId,
  classId,
  registrationGroupId: '40000000-0000-4000-8000-000000000001',
  driverPersonId: '50000000-0000-4000-8000-000000000001',
  vehicleId: '60000000-0000-4000-8000-000000000001',
  verificationStatus: 'unverified',
  acceptanceStatus: 'pending',
  requestedStartNumber: null,
  priceSnapshotVersion: null,
  formSnapshotVersion: null,
  priceSnapshot: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  deletionReason: null,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  root?.unmount();
  vi.restoreAllMocks();
});
function mount() {
  container = document.createElement('div');
  root = createRoot(container);
  return container;
}

describe('AdminEntries', () => {
  it('loads organization-scoped events and requests server-paginated entries with selected filters', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/admin/events') return Response.json([event]);
        if (url.includes('/classes'))
          return Response.json([{ id: classId, name: 'Touring' }]);
        if (url.startsWith('/admin/entries?'))
          return Response.json({
            items: [entry],
            page: 1,
            pageSize: 25,
            total: 1,
            totalPages: 1,
          });
        throw new Error(`Unexpected request ${url}`);
      });
    const node = mount();
    await act(async () => {
      root.render(<AdminEntries />);
    });
    const eventSelect = node.querySelector('select[aria-label="Event"]')!;
    await act(async () => {
      (eventSelect as HTMLSelectElement).value = eventId;
      eventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(node.textContent).toContain('Spring Rally');
    expect(node.textContent).toContain(entryId);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes(`eventId=${eventId}`),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => init?.credentials === 'same-origin',
      ),
    ).toBe(true);
  });

  it('renders distinct 401 and 403 states without public-data fallback', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));
    const node = mount();
    await act(async () => {
      root.render(<AdminEntries />);
    });
    expect(node.textContent).toContain('Sign-in required');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));
    await act(async () => {
      root.unmount();
      root = createRoot(node);
      root.render(<AdminEntries />);
    });
    expect(node.textContent).toContain('Access denied');
  });
});
