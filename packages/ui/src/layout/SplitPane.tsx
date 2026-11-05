import React from 'react';

export function SplitPane({
  main,
  aside,
  asideFirstOnMobile = false,
  stickyAside = false,
  className = '',
}: {
  main: React.ReactNode;
  aside: React.ReactNode;
  asideFirstOnMobile?: boolean;
  stickyAside?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`nb-split-pane ${asideFirstOnMobile ? 'nb-aside-first-mobile' : ''} ${className}`}
    >
      <div className="nb-split-main">{main}</div>
      <aside
        className={stickyAside ? 'nb-split-aside nb-sticky' : 'nb-split-aside'}
      >
        {aside}
      </aside>
    </div>
  );
}
