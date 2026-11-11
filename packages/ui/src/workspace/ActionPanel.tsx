import type { ReactNode } from 'react';
export function ActionPanel({
  title,
  hint,
  action,
  secondary,
  variant = 'default',
}: {
  title: string;
  hint?: string;
  action: ReactNode;
  secondary?: ReactNode;
  variant?: 'default' | 'primary';
}) {
  return (
    <section
      className={`nb-action-panel${variant === 'primary' ? ' is-primary' : ''}`}
    >
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      <div className="nb-action-panel-controls">
        {action}
        {secondary}
      </div>
    </section>
  );
}
