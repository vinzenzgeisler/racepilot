import type { ReactNode } from 'react';
import { Dialog } from '../dialog/Dialog.js';

/**
 * A dialog that collects a few inputs and confirms them; no reason is asked.
 * Without `confirmLabel` it only informs and offers to close, for results such as a created link.
 */
export function FormDialog({
  open,
  title,
  message,
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
  confirmLabel?: string | undefined;
  cancelLabel: string;
  closeLabel: string;
  busy?: boolean;
  error?: string | undefined;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
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
          {confirmLabel && (
            <button
              type="button"
              className="nb-confirm-primary"
              disabled={busy || confirmDisabled}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          )}
        </>
      }
    >
      <div className="nb-reason-body">
        {message && <p>{message}</p>}
        {children}
        {error && (
          <p role="alert" className="nb-reason-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
