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
export type SetupClassDraft = {
  id?: string;
  name: string;
  code: string;
  fee: string;
  vehicleType: VehicleType;
};
export type SetupDraft = {
  id?: string;
  name: string;
  slug: string;
  startsOn: string;
  endsOn: string;
  classes: SetupClassDraft[];
  terms: string;
};
export type EventOption = Pick<SetupEvent, 'id' | 'name' | 'slug' | 'status'>;

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
    throw new Error(
      body?.error ?? `Speichern fehlgeschlagen (${response.status}).`,
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
  request<Array<{ classId: string; baseCents: number }>>(
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
        maxParticipants: null,
        closed: false,
      }),
    },
  );
export const savePricing = (
  eventId: string,
  classId: string,
  baseCents: number,
) =>
  request(
    `/admin/events/${encodeURIComponent(eventId)}/pricing/${encodeURIComponent(classId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        baseCents,
        additionalEntryAdjustmentCents: 0,
        earlyBirdDeadline: null,
        earlyBirdDiscountCents: 0,
      }),
    },
  );
export const loadTerms = (eventId: string) =>
  request<{ terms?: Array<{ text?: string }> }>(
    `/admin/events/${encodeURIComponent(eventId)}/consents`,
  );
export const saveTerms = async (eventId: string, terms: string) => {
  const text = terms.trim();
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return request(`/admin/events/${encodeURIComponent(eventId)}/consents`, {
    method: 'PUT',
    body: JSON.stringify({
      terms: text
        ? [
            {
              key: 'participation',
              version: '1',
              language: 'de',
              text,
              hash,
              required: true,
            },
          ]
        : [],
    }),
  });
};
export const openEvent = (eventId: string) =>
  request<SetupEvent>(
    `/admin/events/${encodeURIComponent(eventId)}/transitions`,
    {
      method: 'POST',
      body: JSON.stringify({ status: 'open' }),
    },
  );
