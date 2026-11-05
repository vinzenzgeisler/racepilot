import React from 'react';

export type IconName =
  | 'list'
  | 'document'
  | 'mail'
  | 'calendar'
  | 'approval'
  | 'info'
  | 'search'
  | 'filter'
  | 'more'
  | 'next';

const paths: Record<IconName, React.ReactNode> = {
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  document: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
    </>
  ),
  mail: <path d="M3 6h18v12H3zM3 6l9 7 9-7" />,
  calendar: <path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" />,
  approval: <path d="M5 5h3M16 5h3v16H5V5M9 13l2 2 4-4" />,
  info: <path d="M12 3l9 17H3zM12 10v4M12 16.5v1" />,
  search: <path d="M4 4h10v10H4zM14 14l6 6" />,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  more: (
    <path d="M5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2z" fill="currentColor" />
  ),
  next: <path d="M4 12h16M14 6l6 6-6 6" />,
};
export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg
      className="nb-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths[name]}
    </svg>
  );
}
