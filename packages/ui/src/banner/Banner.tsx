import React from 'react';
export function Banner({
  tone = 'info',
  title,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
}) {
  return (
    <aside
      {...props}
      className={`nb-banner nb-banner-${tone} ${props.className ?? ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </aside>
  );
}
