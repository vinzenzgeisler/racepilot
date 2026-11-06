import React from 'react';
export function FilterBar({
  label,
  children,
  actions,
  activeFilters,
  onRemoveFilter,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  label: string;
  actions?: React.ReactNode;
  activeFilters?: Array<{ id: string; label: string; removeLabel: string }>;
  onRemoveFilter?: (id: string) => void;
}) {
  return (
    <section
      {...props}
      className={`nb-filter-bar ${props.className ?? ''}`}
      aria-label={label}
    >
      <div>{children}</div>
      {actions && <div className="nb-filter-actions">{actions}</div>}
      {activeFilters && activeFilters.length > 0 && (
        <div className="nb-active-filters">
          {activeFilters.map((filter) => (
            <button
              type="button"
              key={filter.id}
              aria-label={filter.removeLabel}
              onClick={() => onRemoveFilter?.(filter.id)}
            >
              {filter.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
