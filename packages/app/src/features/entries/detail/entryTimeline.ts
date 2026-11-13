import { actorName } from './actorName.js';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { WorkflowView } from '../AdminEntriesModel.js';

type History = NonNullable<Entry['adminHistory']>[number];

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
  if (event.label === 'internal_note')
    return {
      title: 'Interne Notiz',
      tone: 'dark',
      ...(detail ? { detail } : {}),
    };
  if (event.label === 'driver_note')
    return {
      title: 'Fahrernotiz',
      tone: 'accent',
      ...(detail ? { detail } : {}),
    };
  if (event.label === 'class_changed')
    return {
      title: 'Klasse geändert',
      tone: 'dark',
      ...(detail ? { detail } : {}),
    };
  if (event.label === 'amount_adjusted')
    return {
      title: 'Betrag angepasst',
      tone: 'dark',
      ...(detail ? { detail } : {}),
    };
  if (event.label === 'passenger_added')
    return {
      title: 'Beifahrer eingetragen',
      tone: 'dark',
      ...(detail ? { detail } : {}),
    };
  if (event.label === 'passenger_link_created')
    return {
      title: 'Persönlicher Link für den Beifahrer erstellt',
      tone: 'dark',
    };
  if (event.label === 'passenger_completed')
    return {
      title: 'Beifahrer hat seine Daten abgeschlossen',
      tone: 'accent',
    };
  if (event.label === 'deleted')
    return {
      title: 'Nennung gelöscht',
      tone: 'dark',
      ...(detail ? { detail } : {}),
    };
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
