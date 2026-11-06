import React from 'react';
export type Status =
  | 'new'
  | 'in_progress'
  | 'missing'
  | 'done'
  | 'rejected'
  | 'not_relevant'
  /** The field has no value at all; shown as a bare dash. */
  | 'empty';
const marks: Record<Status, string> = {
  new: 'square',
  in_progress: 'square',
  missing: 'square',
  done: 'square',
  rejected: '×',
  not_relevant: '–',
  empty: '–',
};
export function StatusLabel({
  status,
  label,
}: {
  status: Status;
  label: string;
}) {
  const mark = marks[status];
  if (status === 'empty')
    return (
      <span className="nb-status nb-status-empty">
        <span aria-hidden="true">{mark}</span>
        <span className="nb-visually-hidden">{label}</span>
      </span>
    );
  return (
    <span className={`nb-status nb-status-${status}`}>
      {mark === 'square' ? (
        <i className="nb-status-mark" aria-hidden="true" />
      ) : (
        <span className="nb-status-mark-text" aria-hidden="true">
          {mark}
        </span>
      )}
      {label}
    </span>
  );
}
export function HintLabel({ children }: { children: React.ReactNode }) {
  return <span className="nb-hint">{children}</span>;
}
