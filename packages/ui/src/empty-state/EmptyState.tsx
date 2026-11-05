import React from 'react';
export function EmptyState({
  title,
  description,
  action,
  icon,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <section {...props} className={`nb-empty-state ${props.className ?? ''}`}>
      <div aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div>{action}</div>}
    </section>
  );
}
