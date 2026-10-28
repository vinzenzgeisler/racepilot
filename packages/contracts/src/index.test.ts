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
