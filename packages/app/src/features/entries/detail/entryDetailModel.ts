import type { EntryResponse as Entry } from '@racepilot/contracts';

export const NOT_GIVEN = 'nicht angegeben';

const VEHICLE_TYPES: Record<string, string> = {
  car: 'Auto',
  motorcycle: 'Motorrad',
  kart: 'Kart',
  other: 'Sonstiges',
};
/** The vehicle type follows the class; an unknown stored value is shown as it is, never guessed. */
export const vehicleTypeLabel = (type: string | null | undefined) =>
  type ? (VEHICLE_TYPES[type] ?? type) : null;
type Dimension = NonNullable<Entry['statusProjection']>['dimensions'][number];

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

export { timelineFor, type TimelineItem } from './entryTimeline.js';
