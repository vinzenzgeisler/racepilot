import type { ReactNode } from 'react';
export function ActionPanel({
  title,
  hint,
  action,
  secondary,
}: {
  title: string;
  hint?: string;
  action: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <section className="nb-action-panel">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      <div className="nb-action-panel-controls">
        {action}
        {secondary}
      </div>
    </section>
  );
}
