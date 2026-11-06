import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { WorkflowView } from '../AdminEntriesModel.js';

export const NOT_GIVEN = 'nicht angegeben';
type Dimension = NonNullable<Entry['statusProjection']>['dimensions'][number];
type History = NonNullable<Entry['adminHistory']>[number];

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...options });
const full = formatter({
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const short = formatter({
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const dateOnly = formatter({ dateStyle: 'medium' });
const euro = (cents: number, currency: string) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(
    cents / 100,
  );

export const formatDateTime = (iso: string) =>
  full.format(new Date(iso)).replace(', ', ' ');
export const formatShortDateTime = (iso: string) =>
  short.format(new Date(iso)).replace(', ', ' ');
export const formatMoney = euro;
export const formatBirthDate = (value: string | null | undefined) =>
  value ? dateOnly.format(new Date(`${value}T12:00:00`)) : null;

export function countryName(code: string | null | undefined) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['de'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The common starting countries of the club events; any other stored code stays selectable. */
export const COUNTRY_CODES = [
  'DE',
  'AT',
  'CH',
  'CZ',
  'PL',
  'NL',
  'BE',
  'FR',
  'IT',
  'GB',
  'DK',
  'SE',
  'NO',
  'FI',
  'HU',
  'SK',
  'SI',
  'HR',
  'ES',
  'PT',
  'LU',
  'LI',
  'US',
] as const;

export const PUBLICATION_LABELS = {
  name_visible: 'Name sichtbar',
  initials: 'Nur Initialen',
  hidden: 'Nicht veröffentlichen',
} as const;

export function lastChangeAt(entry: Entry): string | null {
  const times = (entry.adminHistory ?? []).map((item) => item.occurredAt);
  return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;
}

const DIMENSION_NAMES: Record<Dimension['key'], string> = {
  entry: 'Status',
  payment: 'Zahlung',
  technical_inspection: 'Abnahme',
  waiver: 'Haftverzicht',
  email_verification: 'E-Mail',
};
export const dimensionName = (key: Dimension['key']) => DIMENSION_NAMES[key];

/** "Zahlung · Bezahlt"; a verified e-mail reads as one word pair like in the design. */
export function dimensionLabel(item: Dimension) {
  return `${DIMENSION_NAMES[item.key]} · ${item.label.de}`;
}

const MISSING_NAMES: Record<string, string> = {
  payment: 'die Zahlung',
  technical_inspection: 'die technische Abnahme',
  waiver: 'der Haftverzicht',
};
/** Open requirements that still block a clean acceptance, as one German phrase. */
export function missingRequirements(entry: Entry): string | null {
  const names =
    entry.statusProjection?.dimensions
      .filter(
        (item) =>
          item.key in MISSING_NAMES &&
          item.required &&
          item.meaning !== 'done' &&
          item.meaning !== 'not_relevant',
      )
      .map((item) => MISSING_NAMES[item.key]!) ?? [];
  if (!names.length) return null;
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
    : names[0]!;
}

const FIELD_NAMES: Record<string, string> = {
  firstName: 'Vorname',
  lastName: 'Nachname',
  dateOfBirth: 'Geburtsdatum',
  country: 'Land',
  phone: 'Telefon',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Ort',
  emergencyContactName: 'Notfallkontakt',
  emergencyContactPhone: 'Notfalltelefon',
  publicationPreference: 'Veröffentlichung',
  make: 'Hersteller',
  model: 'Modell',
  year: 'Baujahr',
  registration: 'Kennzeichen',
  vehicleType: 'Fahrzeugtyp',
  displacementCc: 'Hubraum',
  cylinders: 'Zylinder',
  ownerName: 'Besitzer',
  history: 'Fahrzeughistorie',
};

const lifecycle: Record<string, string> = {
  acceptance: 'Nennung',
  verification: 'E-Mail-Prüfung',
  technical_inspection: 'Technische Abnahme',
  waiver: 'Haftverzicht',
  payment: 'Zahlung',
};
const knownStatus: Record<string, string> = {
  pending: 'Offen',
  open: 'Offen',
  accepted: 'Zugelassen',
  confirmed: 'Zugelassen',
  rejected: 'Abgelehnt',
  waitlisted: 'Warteliste',
  withdrawn: 'Abgesagt',
  unverified: 'Unbestätigt',
  verified: 'Verifiziert',
  paid: 'Bezahlt',
  partially_paid: 'Teilweise bezahlt',
  not_required: 'Nicht erforderlich',
  not_relevant: 'Nicht relevant',
  f_pending: 'Ausstehend',
  f_signed: 'Unterschrieben',
  bf_signed: 'Beifahrer unterschrieben',
};

export type TimelineItem = {
  id: string;
  title: string;
  occurredAt: string;
  actor: string;
  detail?: string;
  tone: 'dark' | 'accent' | 'open';
};

/** Turns raw audit events into sentences; never shows internal keys such as "f_pending". */
export function timelineFor(
  entry: Entry,
  workflow: WorkflowView | null,
  dimensionLabels: ReadonlyMap<string, string>,
): TimelineItem[] {
  const status = (value: string) =>
    workflow?.statuses.find((item) => item.key === value)?.labels.de ??
    dimensionLabels.get(value) ??
    knownStatus[value] ??
    'Unbekannt';
  // Mails have their own section; the timeline lists decisions and changes.
  const items = (entry.adminHistory ?? [])
    .filter((event) => event.kind !== 'email')
    .map((event): TimelineItem => {
      const base = {
        id: `${event.kind}-${event.id}`,
        occurredAt: event.occurredAt,
      };
      return {
        ...base,
        ...describe(event, status),
        actor: actorName(event.actor),
      };
    });
  items.push({
    id: 'submitted',
    title: 'Nennung eingereicht',
    occurredAt: entry.createdAt,
    actor: 'Teilnehmer',
    tone: 'open',
  });
  return items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function describe(
  event: History,
  status: (key: string) => string,
): Pick<TimelineItem, 'title' | 'tone'> & { detail?: string } {
  const detail = event.detail || undefined;
  if (event.kind === 'payment')
    return {
      title:
        event.label === 'reversal'
          ? 'Zahlung zurückgenommen'
          : 'Zahlung eingegangen',
      tone: 'accent',
      ...(detail ? { detail } : {}),
    };
  if (event.kind === 'email')
    return {
      title: event.label.endsWith(': sent')
        ? 'E-Mail gesendet'
        : 'E-Mail vorgemerkt',
      tone: 'dark',
      ...(detail ? { detail: `An ${detail}` } : {}),
    };
  const data = /^data: (driver|vehicle)( \(copy\))?$/.exec(event.label);
  if (data) {
    const fields = event.detail
      .split(',')
      .map((key) => FIELD_NAMES[key] ?? key)
      .join(', ');
    return {
      title:
        data[1] === 'driver'
          ? 'Fahrerdaten geändert'
          : 'Fahrzeugdaten geändert',
      tone: 'dark',
      detail: data[2]
        ? `${fields} · Das Fahrzeug war mehreren Nennungen zugeordnet und wurde für diese Nennung kopiert; die anderen bleiben unverändert.`
        : fields,
    };
  }
  const match = /^([^:]+): (.+) → (.+)$/.exec(event.label);
  if (!match)
    return {
      title: 'Nennung aktualisiert',
      tone: 'dark',
      ...(detail ? { detail } : {}),
    };
  const [, key, from, to] = match as unknown as [
    string,
    string,
    string,
    string,
  ];
  const subject = lifecycle[key] ?? 'Status';
  return {
    title:
      key === 'acceptance'
        ? `Status von ${status(from)} auf ${status(to)}`
        : `${subject}: ${status(from)} → ${status(to)}`,
    tone: 'dark',
    ...(detail ? { detail } : {}),
  };
}

/** Actors are stored as "issuer#subject" when no member name is known. */
export function actorName(actor: string) {
  if (actor === 'System') return 'System';
  if (
    /https?:\/\//i.test(actor) ||
    /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(actor)
  )
    return 'Veranstalter';
  return actor;
}
