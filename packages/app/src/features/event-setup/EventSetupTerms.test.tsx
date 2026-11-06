// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { EventSetup } from './EventSetup.js';
import type { SetupConsent } from './eventSetupApi.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
const event = {
  id: 'event-1',
  name: 'Frühlingsfahrt',
  slug: 'fruehlingsfahrt',
  startsOn: '2027-05-01',
  endsOn: '2027-05-02',
  status: 'draft',
};
const eventClass = {
  id: 'class-1',
  name: 'Touring',
  code: 'TOUR',
  vehicleType: 'motorcycle',
  sortOrder: 0,
  maxParticipants: null,
  closed: false,
};
const price = {
  classId: 'class-1',
  baseCents: 12550,
  additionalEntryAdjustmentCents: 0,
  earlyBirdDeadline: null,
  earlyBirdDiscountCents: 0,
};
const german: SetupConsent = {
  key: 'participation',
  version: '1',
  language: 'de',
  text: 'Deutsche Teilnahmebedingungen',
  hash: 'a'.repeat(64),
  required: true,
};
const english: SetupConsent = {
  key: 'participation',
  version: '1',
  language: 'en',
  text: 'English participation terms',
  hash: 'b'.repeat(64),
  required: true,
};
let root: Root;
let container: HTMLDivElement;
function response(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}
async function exercise(existing: SetupConsent[], saved: SetupConsent[]) {
  let transitions = 0;
  vi.mocked(adminFetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/admin/events' && method === 'GET')
      return response([{ ...event, status: 'draft' }]);
    if (url === '/admin/events/event-1' && method === 'GET')
      return response(event);
    if (url === '/admin/events/event-1' && method === 'PATCH')
      return response(event);
    if (url.endsWith('/classes') && method === 'GET')
      return response([eventClass]);
    if (url.endsWith('/classes/class-1') && method === 'PATCH')
      return response(eventClass);
    if (url.endsWith('/pricing') && method === 'GET') return response([price]);
    if (url.endsWith('/consents') && method === 'GET')
      return response({ terms: existing });
    if (url.endsWith('/consents') && method === 'PUT')
      return response({ terms: saved });
    if (url.endsWith('/transitions') && method === 'POST') {
      transitions += 1;
      return response({ ...event, status: 'open' });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<EventSetup onCreated={vi.fn()} />));
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = event.id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const terms = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(terms, '');
    terms.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const open = [
    ...container.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  ].find((button) => button.value === 'open')!;
  await act(async () => open.click());
  return { transitions, text: container.textContent ?? '' };
}
describe('event setup saved participation terms', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  it('does not open after deleting the last German participation term from a resumed draft', async () => {
    const result = await exercise([german], []);
    expect(result.transitions).toBe(0);
    expect(result.text).toContain(
      'Zum Öffnen der Nennung müssen verwendbare Teilnahmebedingungen hinterlegt sein.',
    );
  });
  it('opens when the saved snapshot retains usable English participation terms', async () => {
    const result = await exercise([german, english], [english]);
    expect(result.transitions).toBe(1);
    expect(result.text).toContain(
      'Veranstaltung gespeichert und Nennung geöffnet.',
    );
  });
});
