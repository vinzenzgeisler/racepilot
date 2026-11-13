import type { EntryFilterKey, EventOverview } from '@racepilot/contracts';

const MINOR_UNITS_PER_MAJOR = 100;

export type EntryFilters = Partial<Record<EntryFilterKey, string>>;

/** Display names of the workflow categories the overview groups the entries by. */
const CATEGORY_LABELS: Record<string, string> = {
  pending: 'Offen',
  waitlisted: 'Warteliste',
  accepted: 'Zugelassen',
  rejected: 'Abgelehnt',
  withdrawn: 'Zurückgezogen',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

export const formatMoney = (cents: number, currency: string): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(
    cents / MINOR_UNITS_PER_MAJOR,
  );

export type StatusRow = { key: string; label: string; count: number };

/** Known categories in workflow order, then any custom category by name. */
export function statusRows(statuses: EventOverview['statuses']): StatusRow[] {
  const rank = (key: string) => {
    const index = CATEGORY_ORDER.indexOf(key);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };
  return Object.entries(statuses)
    .map(([key, count]) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
      count,
    }))
    .sort(
      (a, b) =>
        rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, 'de'),
    );
}

export const totalEntries = (statuses: EventOverview['statuses']): number =>
  Object.values(statuses).reduce((sum, count) => sum + count, 0);

export function deadlineText(days: number | null): {
  value: string;
  detail: string;
} {
  if (days === null)
    return { value: '–', detail: 'Kein Nennungsschluss festgelegt' };
  if (days === 0) return { value: '0', detail: 'Heute oder bereits vorbei' };
  return { value: String(days), detail: days === 1 ? 'Tag' : 'Tage' };
}

/** Wording of a warning from the overview; the server owns the filter, not the sentence. */
export function warningText(
  warning: EventOverview['warnings'][number],
): string {
  const noun = warning.count === 1 ? 'Nennung' : 'Nennungen';
  return `${warning.count} ${noun} ohne bestätigte E-Mail-Adresse`;
}

/**
 * The entry-list filters to open for a warning: exactly the ones the server delivered, and
 * only for the event that is shown, so a late answer cannot filter another event's list.
 */
export function warningFilters(
  warning: EventOverview['warnings'][number],
  eventId: string,
): EntryFilters | null {
  if (warning.filter.eventId !== eventId) return null;
  return { verificationStatus: warning.filter.verificationStatus };
}
