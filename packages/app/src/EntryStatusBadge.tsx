import type { WorkflowStatus } from './AdminEntriesModel.js';

export function EntryStatusBadge({
  status,
  fallback,
}: {
  status: WorkflowStatus | undefined;
  fallback: string;
}) {
  const locale = navigator.language.toLowerCase().startsWith('de')
    ? 'de'
    : 'en';
  return (
    <span
      className="entry-status"
      style={
        status ? { color: status.color, borderColor: status.color } : undefined
      }
      title={fallback}
    >
      {status ? `${status.labels[locale]} · ${status.key}` : fallback}
    </span>
  );
}
