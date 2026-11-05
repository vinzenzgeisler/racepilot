import { StatusLabel } from '@racepilot/ui';
import type { WorkflowStatus } from './AdminEntriesModel.js';

const statusLabels: Record<string, string> = {
  pending: 'Offen',
  open: 'Offen',
  accepted: 'Zugelassen',
  confirmed: 'Zugelassen',
  rejected: 'Abgelehnt',
  waitlisted: 'Warteliste',
  withdrawn: 'Zurückgezogen',
  f_pending: 'Haftverzicht ausstehend',
  f_signed: 'Haftverzicht unterschrieben',
  bf_signed: 'Beifahrer-Haftverzicht unterschrieben',
  unverified: 'Unbestätigt',
  verified: 'Verifiziert',
  partially_paid: 'Teilweise bezahlt',
  paid: 'Bezahlt',
  not_required: 'Nicht erforderlich',
  not_relevant: 'Nicht relevant',
};
const statusMeaning = (category: string) => {
  switch (category) {
    case 'accepted':
      return 'done' as const;
    case 'rejected':
      return 'rejected' as const;
    case 'waitlisted':
      return 'in_progress' as const;
    case 'withdrawn':
      return 'not_relevant' as const;
    default:
      return 'new' as const;
  }
};

export function EntryStatusBadge({
  status,
  fallback,
}: {
  status: WorkflowStatus | undefined;
  fallback: string;
}) {
  return status ? (
    <StatusLabel
      status={statusMeaning(status.category)}
      label={status.labels.de}
    />
  ) : (
    <StatusLabel
      status="new"
      label={statusLabels[fallback] ?? 'Status unbekannt'}
    />
  );
}
