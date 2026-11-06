import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { saveClass, savePricing, saveTerms } from './eventSetupApi.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('event setup writes', () => {
  it('leaves capacity and class lock fields out of an existing class patch', async () => {
    vi.mocked(adminFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

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

    const [, init] = vi.mocked(adminFetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Touring',
      code: 'TOUR',
      vehicleType: 'motorcycle',
      sortOrder: 0,
    });
  });

  it('writes a changed base price without resetting its existing pricing rules', async () => {
    vi.mocked(adminFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    await savePricing('event-1', 'class-1', {
      baseCents: 15000,
      additionalEntryAdjustmentCents: -2500,
      earlyBirdDeadline: '2027-04-01T00:00:00.000Z',
      earlyBirdDiscountCents: 1000,
    });

    const [, init] = vi.mocked(adminFetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      baseCents: 15000,
      additionalEntryAdjustmentCents: -2500,
      earlyBirdDeadline: '2027-04-01T00:00:00.000Z',
      earlyBirdDiscountCents: 1000,
    });
  });

  it('preserves other languages and terms while incrementing only the changed German version', async () => {
    vi.mocked(adminFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
    const english = {
      key: 'participation',
      version: '4',
      language: 'en' as const,
      text: 'English terms',
      hash: 'a'.repeat(64),
      required: true,
    };
    const german = {
      key: 'participation',
      version: '7',
      language: 'de' as const,
      text: 'Bisherige Bedingungen',
      hash: 'b'.repeat(64),
      required: false,
    };
    const privacy = {
      key: 'privacy',
      version: '2',
      language: 'de' as const,
      text: 'Datenschutz',
      hash: 'c'.repeat(64),
      required: true,
    };

    await saveTerms('event-1', 'Neue Bedingungen', [english, german, privacy]);

    const [, init] = vi.mocked(adminFetch).mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as {
      terms: Array<Record<string, unknown>>;
    };
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
