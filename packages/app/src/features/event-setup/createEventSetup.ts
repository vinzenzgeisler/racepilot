import { z } from 'zod';
import {
  request,
  type SetupDraft,
  type SetupEvent,
  type SetupConsent,
} from './eventSetupApi.js';
const SetupEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  status: z.enum(['draft', 'open', 'closed', 'archived']),
});
export async function createEventSetup(draft: SetupDraft): Promise<SetupEvent> {
  const classes = await Promise.all(
    draft.classes.map(async (item) => ({
      name: item.name.trim(),
      code: item.code.trim().toUpperCase(),
      vehicleType: item.vehicleType,
      maxParticipants: item.maxParticipants ?? null,
      closed: item.closed ?? false,
      ...(item.passengerMode && { passengerMode: item.passengerMode }),
      price: {
        baseCents: Math.round(parseSetupFee(item.fee) * 100),
        additionalEntryAdjustmentCents:
          item.additionalEntryAdjustmentCents ?? 0,
        earlyBirdDeadline: item.earlyBirdDeadline ?? null,
        earlyBirdDiscountCents: item.earlyBirdDiscountCents ?? 0,
      },
    })),
  );

  const text = draft.terms.trim();
  const terms: SetupConsent[] = [...(draft.consentTerms ?? [])];
  if (text) {
    const current = terms.find(
      (term) => term.key === 'participation' && term.language === 'de',
    );
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
      ),
    ]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    terms.splice(
      0,
      terms.length,
      ...terms.filter(
        (term) => !(term.key === 'participation' && term.language === 'de'),
      ),
    );
    terms.push({
      key: 'participation',
      version: nextTermVersion(current?.version),
      language: 'de',
      text,
      hash,
      required: current?.required ?? true,
    });
  }
  return request('/admin/events/setup', SetupEventSchema, {
    method: 'POST',
    body: JSON.stringify({
      event: {
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
      },
      classes,
      terms,
    }),
  });
}
function parseSetupFee(value: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error('Ungültiges Startgeld.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error('Ungültiges Startgeld.');
  return amount;
}

function nextTermVersion(version: string | undefined): string {
  if (!version) return '1';
  const match = /^(.*?)(\d+)$/.exec(version);
  return match ? `${match[1]}${Number(match[2]) + 1}` : `${version}.1`;
}
