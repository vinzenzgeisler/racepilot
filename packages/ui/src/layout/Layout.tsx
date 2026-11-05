import React from 'react';
type Gap = 1 | 2 | 3 | 4 | 6 | 8 | 12;
type LayoutProps = React.HTMLAttributes<HTMLDivElement> & { gap?: Gap };
export function Stack({ gap = 3, ...props }: LayoutProps) {
  return (
    <div
      {...props}
      className={`nb-stack nb-gap-${gap} ${props.className ?? ''}`}
    />
  );
}
export function Inline({ gap = 3, ...props }: LayoutProps) {
  return (
    <div
      {...props}
      className={`nb-inline nb-gap-${gap} ${props.className ?? ''}`}
    />
  );
}
