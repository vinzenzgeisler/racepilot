import { ReasonDialog } from '@racepilot/ui';
import type { UploadLine } from './documentLines.js';

export function EntryDocumentRejectDialog({
  line,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  line: UploadLine | null;
  busy: boolean;
  error: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  if (!line) return null;
  return (
    <ReasonDialog
      open
      title={`${line.label} ablehnen`}
      message="Die Begründung wird im Verlauf protokolliert. Danach kann die Unterlage neu nachgefordert werden."
      reasonLabel="Begründung (für das Protokoll erforderlich)"
      confirmLabel="Ablehnen"
      confirmTone="danger"
      cancelLabel="Abbrechen"
      closeLabel="Dialog schließen"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
