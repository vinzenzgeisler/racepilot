// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { standardRegistrationForm } from '@racepilot/contracts';
import { Registration, RegistrationVerification } from './Registration.js';
import './styles.css';

const terms = [
  {
    key: 'terms',
    version: 'v1',
    language: 'en' as const,
    text: 'Event-specific legal text',
    hash: 'a'.repeat(64),
  },
  {
    key: 'terms',
    version: 'v1',
    language: 'de' as const,
    text: 'Veranstaltungsbedingungen',
    hash: 'b'.repeat(64),
  },
];
const registrationForm = {
  form: standardRegistrationForm,
  event: {
    id: '20000000-0000-4000-8000-000000000001',
    slug: 'demo',
    name: 'Demo Event',
    startsOn: '2030-01-01',
  },
  classes: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      name: 'Touring',
      code: 'T',
      vehicleType: 'car',
      closed: false,
    },
  ],
  consents: terms,
  registrationSettings: {
    sharedContactEmail: 'allowed',
    minimumAge: null,
    guardianRequiredBelowAge: 18,
    maximumClassesPerGroup: 8,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('public registration UI', () => {
  it('renders the versioned form with accessible labels and conditionally requests a guardian', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => registrationForm }),
    );
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <Registration
            organizationId="10000000-0000-4000-8000-000000000001"
            eventSlug="demo"
            defaultLocale="en"
          />,
        ),
      );
      expect(container.textContent).toContain('Demo Event');
      expect(
        Array.from(container.querySelectorAll('label')).some((label) =>
          label.textContent?.includes('First name'),
        ),
      ).toBe(true);
      const germanButton = Array.from(
        container.querySelectorAll('button'),
      ).find((button) => button.textContent === 'Deutsch');
      expect(germanButton).toBeTruthy();
      await act(async () => germanButton?.click());
      expect(container.textContent).toContain('Fahrerdaten');
      expect(
        Array.from(container.querySelectorAll('label')).some((label) =>
          label.textContent?.includes('Vorname'),
        ),
      ).toBe(true);
      const englishButton = Array.from(
        container.querySelectorAll('button'),
      ).find((button) => button.textContent === 'English');
      await act(async () => englishButton?.click());
      const dobLabel = Array.from(container.querySelectorAll('label')).find(
        (label) => label.textContent?.includes('Date of birth'),
      );
      const dob = dobLabel?.querySelector('input');
      expect(dob).toBeTruthy();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      await act(async () => {
        setter?.call(dob, '2015-01-01');
        dob?.dispatchEvent(new Event('input', { bubbles: true }));
        dob?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(container.textContent).toContain('Parent or guardian name');
      expect(container.querySelector('input[type="email"]')).toBeTruthy();
    } finally {
      root.unmount();
    }
  });

  it('shows a neutral expired-token state and never renders the token', async () => {
    window.history.replaceState(
      {},
      '',
      '/registration/verify?token=secret-test-token',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ verified: false }),
      }),
    );
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(<RegistrationVerification locale="de" />),
      );
      expect(container.textContent).toContain('ungültig oder abgelaufen');
      expect(container.textContent).not.toContain('secret-test-token');
    } finally {
      root.unmount();
      window.history.replaceState({}, '', '/');
    }
  });
});
