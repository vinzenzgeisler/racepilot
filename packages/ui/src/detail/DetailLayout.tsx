import type { ReactNode } from 'react';
/** Header across the full width; below it the content and the action rail side by side. */
export function DetailLayout({
  header,
  rail,
  railLabel,
  children,
}: {
  header: ReactNode;
  rail?: ReactNode;
  railLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className={`nb-detail${rail ? ' has-rail' : ''}`}>
      <div className="nb-detail-header">{header}</div>
      <div className="nb-detail-main">{children}</div>
      {rail && (
        <aside className="nb-detail-rail" aria-label={railLabel}>
          {rail}
        </aside>
      )}
    </div>
  );
}
