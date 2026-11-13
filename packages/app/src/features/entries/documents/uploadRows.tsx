import { Button, StatusLabel } from '@racepilot/ui';
import { EntryDocumentDownload } from './EntryDocumentDownload.js';
import { documentStatusView, type UploadLine } from './documentLines.js';

type Handlers = {
  busy: boolean;
  onReview: (line: UploadLine) => void;
  onReject: (line: UploadLine) => void;
  onRequest?: ((line: UploadLine) => void) | undefined;
};

function noteFor(line: UploadLine) {
  if (line.status === 'rejected' && line.document?.rejectionReason)
    return `Grund: ${line.document.rejectionReason}`;
  if (line.status === 'missing')
    return [line.required ? null : 'Optional', line.hint]
      .filter(Boolean)
      .join(' · ');
  return undefined;
}

function Actions({
  entryId,
  line,
  busy,
  onReview,
  onReject,
  onRequest,
}: Handlers & { entryId: string; line: UploadLine }) {
  return (
    <>
      {line.document && (
        <EntryDocumentDownload
          entryId={entryId}
          documentId={line.document.id}
          fileName={line.document.fileName}
        />
      )}
      {line.status === 'uploaded' && (
        <>
          <Button
            variant="text"
            size={32}
            disabled={busy}
            onClick={() => onReview(line)}
          >
            Prüfen
          </Button>
          <Button
            variant="text"
            size={32}
            disabled={busy}
            onClick={() => onReject(line)}
          >
            Ablehnen …
          </Button>
        </>
      )}
      {onRequest &&
        (line.status === 'missing' || line.status === 'rejected') && (
          <Button
            variant="text"
            size={32}
            disabled={busy}
            onClick={() => onRequest(line)}
          >
            Nachfordern
          </Button>
        )}
    </>
  );
}

/** One row per document type of the event, with the real upload state and the actions it allows. */
export function uploadRows(
  entryId: string,
  lines: readonly UploadLine[],
  handlers: Handlers,
) {
  return lines.map((line) => {
    const view = documentStatusView(line.status);
    const note = noteFor(line);
    return {
      id: `document-${line.key}`,
      label: line.label,
      ...(note ? { note } : {}),
      emphasis: line.required && line.status === 'missing',
      status: <StatusLabel status={view.status} label={view.label} />,
      action: <Actions entryId={entryId} line={line} {...handlers} />,
    };
  });
}
