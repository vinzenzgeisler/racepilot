import React from 'react';
export type Status =
  'new' | 'in_progress' | 'missing' | 'done' | 'rejected' | 'not_relevant';
const marks: Record<Status, string> = {
  new: 'square',
  in_progress: 'square',
  missing: 'square',
  done: 'square',
  rejected: '×',
  not_relevant: '–',
};
export function StatusLabel({
  status,
  label,
}: {
  status: Status;
  label: string;
}) {
  const mark = marks[status];
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
