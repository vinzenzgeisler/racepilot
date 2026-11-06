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
