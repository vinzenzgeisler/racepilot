import { describe, expect, it } from 'vitest';
import { healthResponseSchema, RuntimeBootstrapResponse } from './index.js';

describe('healthResponseSchema', () => {
  it('validates a health response', () => {
    expect(
      healthResponseSchema.parse({ status: 'ok', version: '0.0.0' }).status,
    ).toBe('ok');
  });
  it('rejects an invalid status', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'down', version: '0.0.0' })
        .success,
    ).toBe(false);
  });
});

describe('RuntimeBootstrapResponse', () => {
  const valid = {
    schemaVersion: 1,
    configurationVersion: 'v1',
    deploymentMode: 'community',
    organization: {
      id: '10000000-0000-4000-8000-000000000001',
      slug: 'community',
      name: 'Community',
    },
    branding: {
      logoUrl: null,
      primaryColor: '#174ea6',
      accentColor: '#8a5a00',
      contactEmail: null,
      eventImageUrl: null,
    },
    locale: 'en',
    activeEvent: null,
    capabilities: [],
    legalLinks: [],
  };
  it('accepts neutral and configured bootstrap projections', () => {
    expect(RuntimeBootstrapResponse.safeParse(valid).success).toBe(true);
  });
  it('rejects script URLs, CSS injection, and low-contrast text colors', () => {
    expect(
      RuntimeBootstrapResponse.safeParse({
        ...valid,
        branding: { ...valid.branding, logoUrl: 'javascript:alert(1)' },
      }).success,
    ).toBe(false);
    expect(
      RuntimeBootstrapResponse.safeParse({
        ...valid,
        branding: { ...valid.branding, primaryColor: 'red; background:url(x)' },
      }).success,
    ).toBe(false);
    expect(
      RuntimeBootstrapResponse.safeParse({
        ...valid,
        branding: { ...valid.branding, primaryColor: '#eeeeee' },
      }).success,
    ).toBe(false);
  });
});

describe('public registration contracts', () => {
  it('publishes and validates the versioned standard form strictly', async () => {
    const { standardRegistrationForm, StandardRegistrationFormSchema } =
      await import('./index.js');
    expect(
      StandardRegistrationFormSchema.parse(standardRegistrationForm).version,
    ).toBe('1.0');
    expect(
      StandardRegistrationFormSchema.safeParse({
        ...standardRegistrationForm,
        unexpected: true,
      }).success,
    ).toBe(false);
  });
  it('rejects unknown submission keys and defaults registration policy safely', async () => {
    const { PublicRegistrationRequestSchema, RegistrationSettingsSchema } =
      await import('./index.js');
    expect(RegistrationSettingsSchema.parse({}).sharedContactEmail).toBe(
      'allowed',
    );
    expect(
      PublicRegistrationRequestSchema.safeParse({ extra: true }).success,
    ).toBe(false);
    const validRequest = {
      submissionId: '10000000-0000-4000-8000-000000000001',
      formVersion: '1.0',
      language: 'en',
      eventSlug: 'club-event',
      person: {
        firstName: 'Alex',
        lastName: 'Driver',
        email: 'alex@example.test',
        dateOfBirth: '2000-01-01',
      },
      entries: [
        {
          classId: '20000000-0000-4000-8000-000000000001',
          vehicle: {
            make: 'Maker',
            model: 'Car',
            year: 2020,
            registration: null,
          },
        },
      ],
      consents: [
        { key: 'terms', version: 'v1', hash: 'a'.repeat(64), accepted: true },
      ],
    };
    expect(
      PublicRegistrationRequestSchema.safeParse({
        ...validRequest,
        unknownField: true,
      }).success,
    ).toBe(false);
    expect(
      PublicRegistrationRequestSchema.safeParse({
        ...validRequest,
        person: { ...validRequest.person, email: 'not-email' },
      }).success,
    ).toBe(false);
  });
});
