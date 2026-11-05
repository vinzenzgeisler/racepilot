import React from 'react';
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header {...props} className={`nb-page-header ${props.className ?? ''}`}>
      {eyebrow && <p>{eyebrow}</p>}
      <div>
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="nb-page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}
