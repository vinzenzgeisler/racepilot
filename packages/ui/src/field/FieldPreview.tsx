import type { ReactNode } from 'react';
/** One form field as the participant will meet it: its label and whether it is required. */
export function FieldPreview({
  label,
  state,
  stateLabel,
}: {
  label: string;
  state: 'required' | 'optional';
  stateLabel: string;
}) {
  return (
    <li className={`nb-field-preview is-${state}`}>
      <span>{label}</span>
      <small>{stateLabel}</small>
    </li>
  );
}
/** Groups previewed fields; an empty group says so instead of vanishing. */
export function FieldPreviewList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children?: ReactNode;
}) {
  const hasItems =
    Boolean(children) && (!Array.isArray(children) || children.some(Boolean));
  return (
    <section className="nb-field-preview-group">
      <h4>{title}</h4>
      {hasItems ? <ul>{children}</ul> : <p>{empty}</p>}
    </section>
  );
}
