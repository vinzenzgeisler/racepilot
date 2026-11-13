import type {
  EntryDocumentLine,
  EntryResponse as Entry,
} from '@racepilot/contracts';
import type { Status } from '@racepilot/ui';

export type UploadLine = Extract<EntryDocumentLine, { kind: 'upload' }>;
type UploadStatus = UploadLine['status'];

const STATUS_VIEW: Record<UploadStatus, { status: Status; label: string }> = {
  missing: { status: 'missing', label: 'Fehlt' },
  uploaded: { status: 'in_progress', label: 'Hochgeladen' },
  reviewed: { status: 'done', label: 'Geprüft' },
  rejected: { status: 'rejected', label: 'Abgelehnt' },
};

export const documentStatusView = (status: UploadStatus) => STATUS_VIEW[status];

/** Upload lines of the event's document types with their real state for this entry. */
export function uploadLines(entry: Entry): UploadLine[] {
  return (entry.documentProjection?.lines ?? []).flatMap((line) =>
    line.kind === 'upload' ? [line] : [],
  );
}

/** Required documents that still have to be requested from the driver. */
export const requestableUploads = (entry: Entry): UploadLine[] =>
  uploadLines(entry).filter(
    (line) =>
      line.required &&
      (line.status === 'missing' || line.status === 'rejected'),
  );

export const documentDownloadPath = (entryId: string, documentId: string) =>
  `/admin/entries/${encodeURIComponent(entryId)}/documents/${encodeURIComponent(documentId)}/file`;
