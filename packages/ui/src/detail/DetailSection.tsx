import { useId, type ReactNode } from 'react';
export function DetailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="nb-detail-section" aria-labelledby={id}>
      <header>
        <h3 id={id}>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
/** Labelled values in a responsive grid; use `wide` for long free text. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className="nb-field-grid">{children}</dl>;
}
export function FieldItem({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`nb-field-item${wide ? ' is-wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
/** Same grid as FieldGrid for inputs; `wide` children span all columns. */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="nb-form-grid">{children}</div>;
}
export function FormWide({ children }: { children: ReactNode }) {
  return <div className="nb-form-wide">{children}</div>;
}
/** A field value, or the given placeholder when there is none; never invents a value. */
export function FieldValue({
  children,
  empty,
}: {
  children: ReactNode;
  empty: string;
}) {
  return children !== null && children !== undefined && children !== '' ? (
    <>{children}</>
  ) : (
    <span className="nb-field-empty">{empty}</span>
  );
}
/** Quiet explanatory sentence under a section. */
export function DetailNote({ children }: { children: ReactNode }) {
  return <p className="nb-detail-note">{children}</p>;
}
/** Save / cancel row below a form. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="nb-form-actions">{children}</div>;
}
