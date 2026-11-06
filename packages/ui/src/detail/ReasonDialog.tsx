import { useEffect, useState, type ReactNode } from 'react';
import { Dialog } from '../dialog/Dialog.js';
import { Textarea } from '../textarea/Textarea.js';
/** Confirms a recorded decision; the reason is required because it ends up in the history. */
export function ReasonDialog({
  open,
  title,
  message,
  reasonLabel,
  confirmLabel,
  cancelLabel,
  closeLabel,
  busy = false,
  error,
  confirmDisabled = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  reasonLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  busy?: boolean;
  error?: string | undefined;
  confirmDisabled?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  return (
    <Dialog
      open={open}
      title={title}
      closeLabel={closeLabel}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="nb-confirm-primary"
            disabled={busy || confirmDisabled || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message && <p>{message}</p>}
      {children}
      <Textarea
        label={reasonLabel}
        value={reason}
        maxLength={1000}
        required
        onChange={(event) => setReason(event.target.value)}
      />
      {error && (
        <p role="alert" className="nb-reason-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
