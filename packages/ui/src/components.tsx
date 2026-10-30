import React, { useEffect, useId, useRef, useState } from 'react';
import { Signet } from './brand/Signet.js';

export type ButtonVariant =
  'primary' | 'primary-dark' | 'secondary' | 'text' | 'danger';
export type ButtonSize = 56 | 48 | 40 | 32;
export function Button({
  variant = 'primary',
  size = 40,
  confirmText = 'Diese Aktion kann nicht automatisch rückgängig gemacht werden.',
  children,
  className = '',
  onClick,
  onDangerConfirm,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirmText?: string;
  onDangerConfirm?: (reason: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirming(false);
        setReason('');
        triggerRef.current?.focus();
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button, textarea',
          ) ?? [],
        ).filter((element) => !element.hasAttribute('disabled'));
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirming]);
  const isDanger = variant === 'danger';
  const closeDialog = () => {
    setConfirming(false);
    setReason('');
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  return (
    <>
      <button
        {...props}
        ref={triggerRef}
        type={props.type ?? 'button'}
        className={`nb-button nb-${variant} nb-size-${size} ${className}`}
        onClick={(event) => {
          if (isDanger) {
            event.preventDefault();
            if (!props.disabled) setConfirming(true);
            return;
          }
          onClick?.(event);
        }}
      >
        {children}
        {variant.startsWith('primary') && (
          <i aria-hidden="true" className="nb-button-signal" />
        )}
      </button>
      {confirming && (
        <div className="nb-confirm-backdrop">
          <section
            ref={dialogRef}
            className="nb-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nb-confirm-title"
            aria-describedby="nb-confirm-message"
          >
            <h2 id="nb-confirm-title">Aktion bestätigen</h2>
            <p id="nb-confirm-message">{confirmText}</p>
            <label htmlFor="nb-confirm-reason">Grund (erforderlich)</label>
            <textarea
              id="nb-confirm-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
            <div className="nb-confirm-actions">
              <button ref={cancelRef} type="button" onClick={closeDialog}>
                Abbrechen
              </button>
              <button
                type="button"
                className="nb-confirm-danger"
                disabled={!reason.trim()}
                onClick={() => {
                  const value = reason.trim();
                  closeDialog();
                  onDangerConfirm?.(value);
                  if (!onDangerConfirm && onClick) {
                    const nativeEvent = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                    });
                    Object.defineProperty(nativeEvent, 'currentTarget', {
                      value: triggerRef.current,
                    });
                    onClick(
                      nativeEvent as unknown as React.MouseEvent<HTMLButtonElement>,
                    );
                  }
                }}
              >
                Bestätigen
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export type Status =
  'new' | 'in_progress' | 'missing' | 'done' | 'rejected' | 'not_relevant';
const statusInfo: Record<Status, { label: string; mark: string }> = {
  new: { label: 'Neu', mark: 'square' },
  in_progress: { label: 'In Arbeit', mark: 'square' },
  missing: { label: 'Fehlt', mark: 'square' },
  done: { label: 'Erledigt', mark: 'square' },
  rejected: { label: 'Abgelehnt', mark: '×' },
  not_relevant: { label: 'Nicht relevant', mark: '–' },
};
export function StatusLabel({
  status,
  children,
}: {
  status: Status;
  children?: React.ReactNode;
}) {
  const info = statusInfo[status];
  return (
    <span className={`nb-status nb-status-${status}`}>
      {info.mark === 'square' ? (
        <i className="nb-status-mark" aria-hidden="true" />
      ) : (
        <span className="nb-status-mark-text" aria-hidden="true">
          {info.mark}
        </span>
      )}
      {children ?? info.label}
    </span>
  );
}
export function HintLabel({ children }: { children: React.ReactNode }) {
  return <span className="nb-hint">{children}</span>;
}

export function Field({
  label,
  error,
  hint,
  children,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const id = props.id ?? `field-${generatedId}`;
  return (
    <label className="nb-field" htmlFor={id}>
      <span>{label}</span>
      <input
        {...props}
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
      />
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small className="nb-error" id={`${id}-error`}>
          {error}
        </small>
      )}
      {children}
    </label>
  );
}
export function SelectField({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  const id = props.id ?? `select-${generatedId}`;
  return (
    <label className="nb-field" htmlFor={id}>
      <span>{label}</span>
      <select {...props} id={id}>
        {children}
      </select>
    </label>
  );
}
export function Checkbox({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nb-choice">
      <input {...props} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
export function Radio({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nb-choice">
      <input {...props} type="radio" />
      <span>{label}</span>
    </label>
  );
}
export function Switch({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nb-choice nb-switch">
      <input {...props} type="checkbox" role="switch" />
      <span>{label}</span>
    </label>
  );
}

export type IconName =
  | 'list'
  | 'document'
  | 'mail'
  | 'calendar'
  | 'approval'
  | 'info'
  | 'search'
  | 'filter'
  | 'more'
  | 'next';
const paths: Record<IconName, React.ReactNode> = {
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  document: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
    </>
  ),
  mail: (
    <>
      <path d="M3 6h18v12H3zM3 6l9 7 9-7" />
    </>
  ),
  calendar: (
    <>
      <path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" />
    </>
  ),
  approval: (
    <>
      <path d="M5 5h3M16 5h3v16H5V5M9 13l2 2 4-4" />
    </>
  ),
  info: (
    <>
      <path d="M12 3l9 17H3zM12 10v4M12 16.5v1" />
    </>
  ),
  search: (
    <>
      <path d="M4 4h10v10H4zM14 14l6 6" />
    </>
  ),
  filter: (
    <>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </>
  ),
  more: (
    <>
      <path d="M5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2z" fill="currentColor" />
    </>
  ),
  next: <path d="M4 12h16M14 6l6 6-6 6" />,
};
export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg
      className="nb-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths[name]}
    </svg>
  );
}
export function TechnicalLabel({ children }: { children: React.ReactNode }) {
  return <span className="nb-technical">{children}</span>;
}
export function Steps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="nb-steps" aria-label="Fortschritt">
      {steps.map((step, i) => (
        <li
          key={step}
          aria-current={i === current ? 'step' : undefined}
          className={i < current ? 'is-done' : ''}
        >
          <span className="nb-step-mark">
            <Signet className="nb-step-signet" />
            {i < current && (
              <span className="nb-step-check" aria-label="Abgeschlossen">
                ✓
              </span>
            )}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}
export function StartLine({ children }: { children?: React.ReactNode }) {
  return (
    <div className="nb-start-line" aria-hidden="true">
      <span>{children}</span>
    </div>
  );
}
export function Nameplate({ name, detail }: { name: string; detail?: string }) {
  return (
    <span className="nb-nameplate">
      <strong>{name}</strong>
      {detail && <small>{detail}</small>}
    </span>
  );
}
export function StartLight({
  state = 'ready',
}: {
  state?: 'ready' | 'loading' | 'go';
}) {
  return (
    <span
      className={`nb-start-light nb-light-${state}`}
      role="status"
      aria-label={
        state === 'loading' ? 'Lädt' : state === 'go' ? 'Bereit' : 'Wartet'
      }
    >
      <i />
      <i />
      <i />
    </span>
  );
}
export function DataField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nb-data-field">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
export function Toast({
  children,
  action,
  onAction,
  onDismiss,
  duration = 4000,
}: {
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  duration?: number;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);
  if (!visible) return null;
  return (
    <div className="nb-toast" role="status" aria-live="polite">
      {children}
      {action && (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      )}
      <button
        type="button"
        aria-label="Meldung schließen"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
      >
        ×
      </button>
    </div>
  );
}
export function SelectionBar({
  count,
  total,
  action,
  onAction,
  onClear,
}: {
  count: number;
  total: number;
  action: string;
  onAction?: () => void;
  onClear?: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--nb-selection-height');
    root.dataset.nbSelectionBar = 'visible';
    const measure = () =>
      root.style.setProperty(
        '--nb-selection-height',
        `${barRef.current?.getBoundingClientRect().height ?? 72}px`,
      );
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    if (barRef.current) observer?.observe(barRef.current);
    return () => {
      observer?.disconnect();
      delete root.dataset.nbSelectionBar;
      if (previous) root.style.setProperty('--nb-selection-height', previous);
      else root.style.removeProperty('--nb-selection-height');
    };
  }, []);
  return (
    <div
      ref={barRef}
      className="nb-selection"
      role="region"
      aria-label="Auswahlaktionen"
    >
      <strong>{count} ausgewählt</strong>
      <button type="button" onClick={onAction}>
        {action} ({count} von {total})
      </button>
      <button type="button" onClick={onClear}>
        Auswahl aufheben
      </button>
    </div>
  );
}
export function DataTable({
  headers,
  children,
  compact = false,
}: {
  headers: string[];
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="nb-table-scroll">
      <table className={`nb-table ${compact ? 'nb-table-compact' : ''}`}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Menu({
  label = 'Weitere Aktionen',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
        summaryRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return (
    <details ref={detailsRef} className="nb-menu">
      <summary ref={summaryRef} aria-label={label}>
        <Icon name="more" />
      </summary>
      <div
        className="nb-menu-disclosure"
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('button, a')
          ) {
            detailsRef.current!.open = false;
            summaryRef.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}
export function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
}
