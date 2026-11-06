import { adminFetch } from '../../auth.js';

export type SetupEvent = {
  id: string;
  name: string;
  slug: string;
  startsOn: string;
  endsOn: string;
  status: 'draft' | 'open' | 'closed' | 'archived';
};
export type SetupClass = {
  id: string;
  name: string;
  code: string;
  vehicleType: VehicleType;
  sortOrder: number;
  maxParticipants: number | null;
  closed: boolean;
};
export type VehicleType = 'car' | 'motorcycle' | 'kart' | 'other';
export type SetupPriceRule = {
  classId: string;
  baseCents: number;
  additionalEntryAdjustmentCents: number;
  earlyBirdDeadline: string | null;
  earlyBirdDiscountCents: number;
};
export type SetupConsent = {
  key: string;
  version: string;
  language: 'de' | 'en';
  text: string;
  hash: string;
  required: boolean;
};
export type SetupClassDraft = {
  id?: string;
  name: string;
  code: string;
  fee: string;
  vehicleType: VehicleType;
  maxParticipants?: number | null;
  closed?: boolean;
  additionalEntryAdjustmentCents?: number;
  earlyBirdDeadline?: string | null;
  earlyBirdDiscountCents?: number;
};
export type SetupDraft = {
  id?: string;
  name: string;
  slug: string;
  startsOn: string;
  endsOn: string;
  classes: SetupClassDraft[];
  terms: string;
  consentTerms?: SetupConsent[];
};
export type EventOption = Pick<SetupEvent, 'id' | 'name' | 'slug' | 'status'>;

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await adminFetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new HttpError(
      body?.error ?? `Speichern fehlgeschlagen (${response.status}).`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export const listEvents = () => request<EventOption[]>('/admin/events');
export const loadEvent = (id: string) =>
  request<SetupEvent>(`/admin/events/${encodeURIComponent(id)}`);
export const saveEvent = (draft: SetupDraft) =>
  draft.id
    ? request<SetupEvent>(`/admin/events/${encodeURIComponent(draft.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          slug: draft.slug.trim(),
          startsOn: draft.startsOn,
          endsOn: draft.endsOn,
        }),
      })
    : request<SetupEvent>('/admin/events', {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          slug: draft.slug.trim(),
          startsOn: draft.startsOn,
          endsOn: draft.endsOn,
        }),
      });
export const listClasses = (eventId: string) =>
  request<SetupClass[]>(`/admin/events/${encodeURIComponent(eventId)}/classes`);
export const listPricing = (eventId: string) =>
  request<SetupPriceRule[]>(
    `/admin/events/${encodeURIComponent(eventId)}/pricing`,
  );
export const saveClass = (
  eventId: string,
  item: SetupClassDraft,
  sortOrder: number,
) =>
  request<SetupClass>(
    item.id
      ? `/admin/events/${encodeURIComponent(eventId)}/classes/${encodeURIComponent(item.id)}`
      : `/admin/events/${encodeURIComponent(eventId)}/classes`,
    {
      method: item.id ? 'PATCH' : 'POST',
      body: JSON.stringify({
        name: item.name.trim(),
        code: item.code.trim(),
        vehicleType: item.vehicleType,
        sortOrder,
      }),
    },
  );
export const savePricing = (
  eventId: string,
  classId: string,
  rule: Omit<SetupPriceRule, 'classId'>,
) =>
  request(
    `/admin/events/${encodeURIComponent(eventId)}/pricing/${encodeURIComponent(classId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        ...rule,
      }),
    },
  );
export const loadTerms = (eventId: string) =>
  request<{ terms?: SetupConsent[] }>(
    `/admin/events/${encodeURIComponent(eventId)}/consents`,
  );
export const saveTerms = async (
  eventId: string,
  terms: string,
  existing: SetupConsent[],
) => {
  const text = terms.trim();
  const current = existing.find(
    (term) => term.key === 'participation' && term.language === 'de',
  );
  if (current?.text === text || (!current && !text)) return;
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return request<{ terms: SetupConsent[] }>(
    `/admin/events/${encodeURIComponent(eventId)}/consents`,
    {
      method: 'PUT',
      body: JSON.stringify({
        terms: [
          ...existing.filter(
            (term) => !(term.key === 'participation' && term.language === 'de'),
          ),
          ...(text
            ? [
                {
                  key: 'participation',
                  version: nextTermVersion(current?.version),
                  language: 'de' as const,
                  text,
                  hash,
                  required: current?.required ?? true,
                },
              ]
            : []),
        ],
      }),
    },
  );
};
export const openEvent = (eventId: string) =>
  request<SetupEvent>(
    `/admin/events/${encodeURIComponent(eventId)}/transitions`,
    {
      method: 'POST',
      body: JSON.stringify({ status: 'open' }),
    },
  );

function nextTermVersion(version: string | undefined): string {
  if (!version) return '1';
  const match = /^(.*?)(\d+)$/.exec(version);
  return match ? `${match[1]}${Number(match[2]) + 1}` : `${version}.1`;
}
