import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import {
  saveClass,
  savePricing,
  saveTerms,
  type SetupConsent,
} from './eventSetupApi.js';

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const classResponse = {
  id: 'class-1',
  name: 'Touring',
  code: 'TOUR',
  vehicleType: 'motorcycle',
  sortOrder: 0,
  maxParticipants: null,
  closed: false,
};
const priceResponse = {
  classId: 'class-1',
  baseCents: 15000,
  additionalEntryAdjustmentCents: -2500,
  earlyBirdDeadline: '2027-04-01T00:00:00.000Z',
  earlyBirdDiscountCents: 1000,
};
const termsResponse = { terms: [] };

beforeEach(() => vi.clearAllMocks());

describe('event setup writes', () => {
  it('leaves capacity and class lock fields out of an existing class patch', async () => {
    vi.mocked(adminFetch).mockResolvedValue(jsonResponse(classResponse));

    await saveClass(
      'event-1',
      {
        id: 'class-1',
        name: 'Touring',
        code: 'TOUR',
        vehicleType: 'motorcycle',
        fee: '125.50',
        maxParticipants: 24,
        closed: true,
      },
      0,
    );

    const [, init] = required(
      vi.mocked(adminFetch).mock.calls[0],
      'admin fetch call',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Touring',
      code: 'TOUR',
      vehicleType: 'motorcycle',
      sortOrder: 0,
    });
  });

  it('sends required default capacity settings when creating a new class', async () => {
    vi.mocked(adminFetch).mockResolvedValue(jsonResponse(classResponse, 201));

    await saveClass(
      'event-1',
      {
        name: 'Touring',
        code: 'TOUR',
        vehicleType: 'motorcycle',
        fee: '125.50',
      },
      0,
    );

    const [, init] = required(
      vi.mocked(adminFetch).mock.calls[0],
      'admin fetch call',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Touring',
      code: 'TOUR',
      vehicleType: 'motorcycle',
      sortOrder: 0,
      maxParticipants: null,
      closed: false,
    });
  });

  it('writes a changed base price without resetting its existing pricing rules', async () => {
    vi.mocked(adminFetch).mockResolvedValue(jsonResponse(priceResponse));

    await savePricing('event-1', 'class-1', {
      baseCents: 15000,
      additionalEntryAdjustmentCents: -2500,
      earlyBirdDeadline: '2027-04-01T00:00:00.000Z',
      earlyBirdDiscountCents: 1000,
    });

    const [, init] = required(
      vi.mocked(adminFetch).mock.calls[0],
      'admin fetch call',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      baseCents: 15000,
      additionalEntryAdjustmentCents: -2500,
      earlyBirdDeadline: '2027-04-01T00:00:00.000Z',
      earlyBirdDiscountCents: 1000,
    });
  });

  it('preserves other languages and terms while incrementing only the changed German version', async () => {
    vi.mocked(adminFetch).mockResolvedValue(jsonResponse(termsResponse));
    const english: SetupConsent = {
      key: 'participation',
      version: '4',
      language: 'en',
      text: 'English terms',
      hash: 'a'.repeat(64),
      required: true,
    };
    const german: SetupConsent = {
      key: 'participation',
      version: '7',
      language: 'de',
      text: 'Bisherige Bedingungen',
      hash: 'b'.repeat(64),
      required: false,
    };
    const privacy: SetupConsent = {
      key: 'privacy',
      version: '2',
      language: 'de',
      text: 'Datenschutz',
      hash: 'c'.repeat(64),
      required: true,
    };

    await saveTerms('event-1', 'Neue Bedingungen', [english, german, privacy]);

    const [, init] = required(
      vi.mocked(adminFetch).mock.calls[0],
      'admin fetch call',
    );
    const body = z
      .object({ terms: z.array(z.record(z.string(), z.unknown())) })
      .parse(JSON.parse(String(init?.body)));
    expect(body.terms).toHaveLength(3);
    expect(body.terms).toContainEqual(english);
    expect(body.terms).toContainEqual(privacy);
    expect(
      body.terms.find(
        (term) => term.key === 'participation' && term.language === 'de',
      ),
    ).toMatchObject({
      version: '8',
      text: 'Neue Bedingungen',
      required: false,
    });
  });
});
