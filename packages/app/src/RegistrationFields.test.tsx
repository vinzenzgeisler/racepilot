// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultRegistrationFormConfig,
  standardRegistrationForm,
  type RegistrationDraft,
} from '@racepilot/contracts';
import { Registration } from './Registration.js';
import './styles.css';

const classId = '30000000-0000-4000-8000-000000000001';
const term = {
  key: 'terms',
  version: 'v1',
  language: 'de' as const,
  text: 'Bedingungen',
  hash: 'b'.repeat(64),
};
const form = (fields: Record<string, { state: string }>, legacy = false) => ({
  organization: { name: 'Club', contactEmail: 'club@example.test' },
  form: standardRegistrationForm,
  event: {
    id: '20000000-0000-4000-8000-000000000001',
    slug: 'demo',
    name: 'Demo Event',
    startsOn: '2030-01-01',
    registrationClosesAt: null,
  },
  currency: 'EUR',
  pricing: [],
  registrationFormConfig: {
    ...defaultRegistrationFormConfig,
    fields: legacy
      ? Object.fromEntries(
          Object.entries(defaultRegistrationFormConfig.fields).filter(
            ([key]) => key !== 'publicationPreference',
          ),
        )
      : { ...defaultRegistrationFormConfig.fields, ...fields },
  },
  classes: [
    {
      id: classId,
      name: 'Touring',
      code: 'T',
      vehicleType: 'car',
      closed: false,
    },
  ],
  consents: [term, { ...term, language: 'en' as const, text: 'Terms' }],
  registrationSettings: {
    sharedContactEmail: 'allowed',
    minimumAge: null,
    guardianRequiredBelowAge: 18,
    maximumClassesPerGroup: 8,
  },
});

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.unstubAllGlobals();
});

async function mount(
  payload: ReturnType<typeof form>,
  initialDraft?: RegistrationDraft,
  locale: 'de' | 'en' = 'de',
) {
  const submissions: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith('/registration/submissions')) {
        submissions.push(JSON.parse(String(init?.body)));
        return { ok: true, json: async () => ({ accepted: true }) };
      }
      return { ok: true, json: async () => payload };
    }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Registration
        organizationId="10000000-0000-4000-8000-000000000001"
        eventSlug="demo"
        defaultLocale={locale}
        {...(initialDraft ? { initialDraft } : {})}
      />,
    ),
  );
  return submissions;
}
const control = (label: string) => {
  const labelledControl = [...container.querySelectorAll('label')]
    .find((item) => item.textContent?.trim().startsWith(label))
    ?.querySelector('input,select,textarea');
  const ariaLabelledControl = container.querySelector(
    `[aria-label="${label}"]`,
  );
  return (labelledControl ?? ariaLabelledControl ?? undefined) as
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined;
};
async function fill(label: string, value: string) {
  const element = control(label)!;
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}
async function press(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button)
    throw new Error(
      `no "${text}" button; page: ${container.textContent?.slice(0, 300)}`,
    );
  await act(async () => button.click());
}
const draftWith = (
  patch: Partial<RegistrationDraft> = {},
): RegistrationDraft => ({
  firstName: 'Anna',
  lastName: 'Rennfahrerin',
  email: 'anna@example.test',
  dateOfBirth: '1990-05-05',
  guardianName: '',
  guardianEmail: '',
  phone: '',
  street: '',
  postalCode: '',
  city: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  publicationPreference: '',
  vehicles: [
    {
      classId,
      make: 'NSU',
      model: 'TT',
      year: '1969',
      registration: '',
      requestedStartNumber: '',
      displacementCc: '',
      cylinders: '',
      ownerName: '',
      history: '',
    },
  ],
  accepted: { 'terms:v1:de': true },
  customAnswers: {},
  ...patch,
});

describe('public registration contact and vehicle fields', () => {
  it('asks for each field according to its configured state, in both languages', async () => {
    await mount(
      form({
        phone: { state: 'required' },
        city: { state: 'hidden' },
        owner: { state: 'hidden' },
        cylinders: { state: 'required' },
      }),
      draftWith(),
    );
    expect(control('Telefon')?.required).toBe(true);
    expect(control('Straße und Hausnummer')?.required).toBe(false);
    expect(control('Ort')).toBeUndefined();
    expect(control('Veröffentlichung')).toBeTruthy();
    // Driver step first; the vehicle details follow on the next step.
    await fill('Telefon', '+49 351 123456');
    await press('Weiter zu Startmeldungen');
    expect(control('Zylinder')?.required).toBe(true);
    expect(control('Besitzer')).toBeUndefined();
    expect(control('Hubraum (cm³)')).toBeTruthy();
    expect(control('Fahrzeughistorie')?.tagName).toBe('TEXTAREA');
  });

  it('speaks English and keeps an emergency contact together', async () => {
    await mount(
      form({ emergencyContact: { state: 'optional' } }),
      undefined,
      'en',
    );
    expect(control('Phone')).toBeTruthy();
    expect(control('Emergency contact · Phone')?.required).toBe(false);
    await fill('Emergency contact · Phone', '+49 351 999');
    expect(control('Emergency contact · Name')?.required).toBe(true);
    await fill('Emergency contact · Phone', '');
    await fill('Emergency contact · Name', 'Bernd');
    expect(control('Emergency contact · Phone')?.required).toBe(true);
    expect(control('Publication')?.tagName).toBe('SELECT');
  });

  it('still loads a form whose stored configuration predates the newer fields', async () => {
    await mount(form({}, true));
    expect(control('Veröffentlichung')).toBeTruthy();
    expect(control('Vorname')).toBeTruthy();
  });

  it('sends what was entered and never a field the event no longer asks for', async () => {
    const submissions = await mount(
      form({ city: { state: 'hidden' }, history: { state: 'hidden' } }),
      draftWith({
        // An older draft still holds values for fields that are hidden now.
        city: 'Dresden',
        phone: '+49 351 123456',
        street: 'Musterweg 1',
        postalCode: '01067',
        emergencyContactName: 'Bernd',
        emergencyContactPhone: '+49 351 999',
        publicationPreference: 'initials',
        vehicles: [
          {
            ...draftWith().vehicles[0]!,
            displacementCc: '1177',
            cylinders: '4',
            ownerName: 'Anna',
            history: 'Neuaufbau 2019',
          },
        ],
      }),
    );
    await press('Weiter zu Startmeldungen');
    await press('Weiter zur Prüfung');
    await press('Nennung absenden');
    expect(submissions).toHaveLength(1);
    const body = submissions[0] as {
      person: Record<string, unknown>;
      entries: Array<{ vehicle: Record<string, unknown> }>;
    };
    expect(body.person).toMatchObject({
      phone: '+49 351 123456',
      street: 'Musterweg 1',
      postalCode: '01067',
      city: null,
      emergencyContactName: 'Bernd',
      emergencyContactPhone: '+49 351 999',
      publicationPreference: 'initials',
    });
    expect(body.entries[0]!.vehicle).toMatchObject({
      displacementCc: 1177,
      cylinders: 4,
      ownerName: 'Anna',
      history: null,
    });
  });

  it('keeps collapsed startmeldungen editable and does not hide an incomplete entry from validation', async () => {
    await mount(form({}), draftWith());
    await press('Weiter zu Startmeldungen');
    await press('Startmeldung übernehmen');
    await press('Weiteres Fahrzeug hinzufügen');
    await press('Startmeldung übernehmen');
    expect(control('Klasse')).toBeTruthy();
    await fill('Klasse', classId);
    await fill('Hersteller', 'Kawasaki');
    await fill('Modell', 'ZXR 750');
    await press('Startmeldung übernehmen');
    expect(
      container.querySelectorAll('.registration-vehicle-summary'),
    ).toHaveLength(2);
    await press('Bearbeiten');
    expect(control('Hersteller')?.value).toBe('NSU');
    await press('Weiter zur Prüfung');
    expect(container.textContent).toContain('Kawasaki');
  });
});
