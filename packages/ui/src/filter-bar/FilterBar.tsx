import React from 'react';
export function FilterBar({
  label,
  children,
  actions,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  label: string;
  actions?: React.ReactNode;
}) {
  return (
    <section
      {...props}
      className={`nb-filter-bar ${props.className ?? ''}`}
      aria-label={label}
    >
      <div>{children}</div>
      {actions && <div className="nb-filter-actions">{actions}</div>}
    </section>
  );
}
