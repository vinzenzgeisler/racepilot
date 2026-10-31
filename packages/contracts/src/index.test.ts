import { describe, expect, it } from 'vitest';
import { healthResponseSchema, RuntimeBootstrapResponse } from './index.js';
import {
  deriveAccessibleBrandColors,
  RegistrationFormConfigSchema,
  defaultRegistrationFormConfig,
} from './index.js';

describe('registration brand contrast', () => {
  it('accepts source colors and derives readable foreground/link colors for two sample brands', () => {
    const luminance = (hex: string) => {
      const rgb = hex
        .slice(1)
        .match(/../g)!
        .map((x) => parseInt(x, 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
    };
    const ratio = (a: string, b: string) =>
      (Math.max(luminance(a), luminance(b)) + 0.05) /
      (Math.min(luminance(a), luminance(b)) + 0.05);
    for (const [primary, accent] of [
      ['#1F4AA8', '#F5C518'],
      ['#FFFFFF', '#8FD3F0'],
    ] as const) {
      const colors = deriveAccessibleBrandColors(primary, accent);
      expect(
        ratio(colors.primarySurface, colors.primaryForeground),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        ratio(colors.accentSurface, colors.accentForeground),
      ).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colors.linkColor, '#F5F4EE')).toBeGreaterThanOrEqual(4.5);
      expect(
        RegistrationFormConfigSchema.parse({
          ...defaultRegistrationFormConfig,
          branding: {
            ...defaultRegistrationFormConfig.branding,
            primaryColor: primary,
            accentColor: accent,
          },
        }).branding.primaryColor,
      ).toBe(primary);
    }
    expect(
      deriveAccessibleBrandColors('#FFFFFF', '#8FD3F0').contrastNotice,
    ).toBe(true);
  });
});

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
  it('rejects script URLs and CSS injection while allowing colors to be derived', () => {
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
    ).toBe(true);
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
