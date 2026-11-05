import type { WorkflowView } from './AdminEntriesModel.js';

const lifecycleLabels: Record<string, string> = {
  acceptance: 'Nennung',
  verification: 'E-Mail-Prüfung',
  technical_inspection: 'Technische Abnahme',
  waiver: 'Haftverzicht',
  payment: 'Zahlung',
};
const statusLabels: Record<string, string> = {
  pending: 'Offen',
  open: 'Offen',
  accepted: 'Zugelassen',
  confirmed: 'Zugelassen',
  rejected: 'Abgelehnt',
  waitlisted: 'Warteliste',
  withdrawn: 'Zurückgezogen',
  unverified: 'Unbestätigt',
  verified: 'Verifiziert',
  f_pending: 'Haftverzicht ausstehend',
  f_signed: 'Haftverzicht unterschrieben',
  bf_signed: 'Beifahrer-Haftverzicht unterschrieben',
};
const statusText = (value: string, workflow: WorkflowView | null) =>
  workflow?.statuses.find((item) => item.key === value)?.labels.de ??
  statusLabels[value] ??
  'Status aktualisiert';

export function formatEntryHistoryLabel(
  kind: 'entry' | 'status' | 'payment' | 'email',
  label: string,
  workflow: WorkflowView | null,
) {
  if (kind === 'payment')
    return label === 'reversal' ? 'Zahlung zurückgenommen' : 'Zahlung erfasst';
  if (kind === 'email') {
    const [, state = ''] = label.split(': ');
    return state === 'sent' ? 'E-Mail gesendet' : 'E-Mail aktualisiert';
  }
  const match = /^([^:]+): (.+) → (.+)$/.exec(label);
  if (!match)
    return kind === 'entry' ? 'Nennung aktualisiert' : 'Status aktualisiert';
  const [, key, from, to] = match;
  const transition = lifecycleLabels[key!] ?? 'Status';
  return `${transition}: ${statusText(from!, workflow)} → ${statusText(to!, workflow)}`;
}

export function formatEntryHistoryActor(actor: string) {
  if (
    /https?:\/\//i.test(actor) ||
    /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(actor)
  )
    return 'Veranstalter';
  return actor === 'System' ? 'System' : actor;
}
