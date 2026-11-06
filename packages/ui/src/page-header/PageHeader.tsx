import React from 'react';
export function PageHeader({
  title,
  eyebrow,
  description,
  views,
  selectedView,
  onViewChange,
  actions,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  title: string;
  eyebrow?: string;
  description?: string | undefined;
  views?: Array<{ id: string; label: string }>;
  selectedView?: string;
  onViewChange?: (id: string) => void;
  actions?: React.ReactNode | undefined;
}) {
  return (
    <header {...props} className={`nb-page-header ${props.className ?? ''}`}>
      {eyebrow && <p>{eyebrow}</p>}
      <div>
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {(views?.length || actions) && (
          <div className="nb-page-header-actions">
            {views && views.length > 0 && (
              <div
                className="nb-page-view-switch"
                role="group"
                aria-label={title}
              >
                {views.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    className={selectedView === view.id ? 'is-current' : ''}
                    aria-pressed={selectedView === view.id}
                    onClick={() => onViewChange?.(view.id)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            )}
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
