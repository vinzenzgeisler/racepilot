import type { SVGProps } from 'react';

export function Signet(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="10" height="40" />
      <rect x="34" y="4" width="10" height="40" />
      <rect x="14" y="4" width="7" height="13.5" />
      <rect x="20.5" y="17" width="7" height="14" />
      <rect x="27" y="30.5" width="7" height="13.5" />
    </svg>
  );
}
