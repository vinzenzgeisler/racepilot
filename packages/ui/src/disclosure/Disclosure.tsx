import React from 'react';
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  open,
  ...props
}: Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, 'open'> & {
  label: string;
  open?: boolean;
  defaultOpen?: boolean;
}) {
  return (
    <details
      {...props}
      className={`nb-disclosure ${props.className ?? ''}`}
      open={open ?? defaultOpen}
    >
      <summary>{label}</summary>
      <div>{children}</div>
    </details>
  );
}
