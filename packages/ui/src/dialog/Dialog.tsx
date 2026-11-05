import React, { useEffect, useId, useRef } from 'react';
export function Dialog({
  open,
  title,
  closeLabel,
  onClose,
  children,
  actions,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open && typeof dialog.showModal === 'function')
      dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="nb-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label={closeLabel} onClick={onClose}>
          ×
        </button>
      </header>
      <div>{children}</div>
      {actions && <footer>{actions}</footer>}
    </dialog>
  );
}
