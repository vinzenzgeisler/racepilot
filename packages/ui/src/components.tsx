import React, { useEffect, useId, useState } from 'react';
import { Signet } from './brand/Signet.js';

export type ButtonVariant =
  'primary' | 'primary-dark' | 'secondary' | 'text' | 'danger';
export type ButtonSize = 56 | 48 | 40 | 32;
export function Button({
  variant = 'primary',
  size = 40,
  confirmText,
  children,
  className = '',
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirmText?: string;
}) {
  return (
    <button
      {...props}
      className={`nb-button nb-${variant} nb-size-${size} ${className}`}
      onClick={(event) => {
        if (
          variant === 'danger' &&
          confirmText &&
          !window.confirm(confirmText)
        ) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {variant.startsWith('primary') && (
        <i aria-hidden="true" className="nb-button-signal" />
      )}
      {children}
    </button>
  );
}

export type Status =
  'new' | 'in_progress' | 'missing' | 'done' | 'rejected' | 'not_relevant';
const statusInfo: Record<Status, { label: string; icon: string }> = {
  new: { label: 'Neu', icon: '' },
  in_progress: { label: 'In Arbeit', icon: '●' },
  missing: { label: 'Fehlt', icon: '!' },
  done: { label: 'Erledigt', icon: '✓' },
  rejected: { label: 'Abgelehnt', icon: '×' },
  not_relevant: { label: 'Nicht relevant', icon: '–' },
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
      <span aria-hidden="true">{info.icon}</span>
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
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="m3 7 9 7 9-7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M7 3v4m10-4v4M3 10h18" />
    </>
  ),
  approval: (
    <>
      <path d="m4 12 5 5L20 6" />
      <path d="M21 12v8H3V4h12" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  filter: (
    <>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  next: <path d="M4 12h16m-7-7 7 7-7 7" />,
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
  return (
    <div className="nb-selection" role="region" aria-label="Auswahlaktionen">
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
  return (
    <details className="nb-menu">
      <summary aria-label={label}>
        <Icon name="more" />
      </summary>
      <div role="menu">{children}</div>
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
    <button type="button" role="menuitem" onClick={onClick}>
      {children}
    </button>
  );
}
