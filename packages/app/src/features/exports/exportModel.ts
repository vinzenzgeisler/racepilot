import type {
  ExportDelimiter,
  ExportField,
  ExportFilters,
  ExportJob,
  ExportJobState,
} from '@racepilot/contracts';
import { EXPORT_FIELDS } from '@racepilot/contracts';

export const FIELD_LABELS: Record<ExportField, string> = {
  driver: 'Fahrer',
  vehicle: 'Fahrzeug',
  class: 'Klasse',
  startNumber: 'Startnummer',
  status: 'Status',
  price: 'Preis',
};
export const DELIMITER_LABELS: Record<ExportDelimiter, string> = {
  ';': 'Semikolon (;) – für Excel in Deutschland',
  ',': 'Komma (,)',
};
export const DEFAULT_DELIMITER: ExportDelimiter = ';';
export const ALL_FIELDS: readonly ExportField[] = EXPORT_FIELDS;

export const PAYMENT_OPTIONS = [
  ['open', 'Offen'],
  ['partially_paid', 'Teilweise bezahlt'],
  ['paid', 'Bezahlt'],
  ['not_required', 'Nicht erforderlich'],
  ['not_relevant', 'Nicht relevant'],
] as const;
export const VERIFICATION_OPTIONS = [
  ['unverified', 'Unbestätigt'],
  ['verified', 'Bestätigt'],
] as const;

export type ExportDraft = {
  classId: string;
  acceptanceStatus: string;
  verificationStatus: string;
  paymentStatus: string;
  search: string;
  fields: readonly ExportField[];
  delimiter: ExportDelimiter;
};
export const initialDraft: ExportDraft = {
  classId: '',
  acceptanceStatus: '',
  verificationStatus: '',
  paymentStatus: '',
  search: '',
  fields: ALL_FIELDS,
  delimiter: DEFAULT_DELIMITER,
};

/** Query of the export request: only the filters that are set, exactly like the list. */
export function exportQuery(draft: ExportDraft): URLSearchParams {
  const params = new URLSearchParams({
    fields: ALL_FIELDS.filter((field) => draft.fields.includes(field)).join(
      ',',
    ),
    delimiter: draft.delimiter,
  });
  const filters: Array<[string, string]> = [
    ['classId', draft.classId],
    ['acceptanceStatus', draft.acceptanceStatus],
    ['verificationStatus', draft.verificationStatus],
    ['paymentStatus', draft.paymentStatus],
    ['search', draft.search.trim()],
  ];
  for (const [key, value] of filters) if (value) params.set(key, value);
  return params;
}

export const toggleField = (
  fields: readonly ExportField[],
  field: ExportField,
): ExportField[] =>
  ALL_FIELDS.filter((item) =>
    item === field ? !fields.includes(item) : fields.includes(item),
  );

export const STATE_LABELS: Record<ExportJobState, string> = {
  running: 'Läuft',
  finished: 'Fertig',
  failed: 'Fehlgeschlagen',
  expired: 'Abgelaufen',
};
export const STATE_MEANING = {
  running: 'in_progress',
  finished: 'done',
  failed: 'missing',
  expired: 'not_relevant',
} as const;

export const hasRunningJob = (jobs: readonly ExportJob[]): boolean =>
  jobs.some((job) => job.status === 'running');

const DOWNLOAD_PATH = /^\/admin\/artifact-jobs\/[0-9a-f-]{36}\/download$/;
/** A download address is only followed when it points at an artifact download of this API. */
export const safeDownloadPath = (url: string | null): string | null =>
  url && DOWNLOAD_PATH.test(url) ? url : null;

export function describeFilters(
  filters: ExportFilters,
  names: { classes: Map<string, string>; statuses: Map<string, string> },
): string {
  const parts = [
    filters.classId &&
      `Klasse ${names.classes.get(filters.classId) ?? 'unbekannt'}`,
    filters.acceptanceStatus &&
      `Status ${names.statuses.get(filters.acceptanceStatus) ?? filters.acceptanceStatus}`,
    filters.paymentStatus &&
      `Zahlung ${PAYMENT_OPTIONS.find(([key]) => key === filters.paymentStatus)?.[1] ?? filters.paymentStatus}`,
    filters.verificationStatus &&
      `E-Mail ${VERIFICATION_OPTIONS.find(([key]) => key === filters.verificationStatus)?.[1] ?? filters.verificationStatus}`,
    filters.search && `Suche „${filters.search}“`,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' · ') : 'Alle Nennungen';
}

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(new Date(iso));
