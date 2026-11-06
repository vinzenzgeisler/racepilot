import { useLayoutEffect, useRef, type ReactNode } from 'react';
export function AdminWorkspace({
  navigation,
  header,
  children,
  preview,
  previewLabel,
  mobilePreviewOpen = false,
}: {
  navigation: ReactNode;
  header: ReactNode;
  children: ReactNode;
  preview?: ReactNode;
  previewLabel?: string;
  mobilePreviewOpen?: boolean;
}) {
  const mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main || !preview) return;
    const alignPreview = () => {
      const table = main.querySelector('.nb-table');
      const offset = table
        ? Math.max(
            0,
            table.getBoundingClientRect().top -
              main.getBoundingClientRect().top,
          )
        : 0;
      main.style.setProperty('--nb-preview-offset', `${offset}px`);
    };
    alignPreview();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(alignPreview);
    observer.observe(main);
    const filters = main.querySelector('.nb-filter-bar');
    if (filters) observer.observe(filters);
    const tabs = main.querySelector('.nb-tabs [role=tablist]');
    if (tabs) observer.observe(tabs);
    return () => observer.disconnect();
  }, [children, preview]);
  return (
    <div className="nb-admin-workspace">
      {navigation}
      <div className="nb-admin-workspace-body">
        {header}
        <main className="nb-admin-workspace-main" ref={mainRef}>
          <div className="nb-admin-workspace-content">{children}</div>
          {preview && (
            <aside
              className={`nb-admin-workspace-preview${mobilePreviewOpen ? ' is-mobile-open' : ''}`}
              aria-label={previewLabel}
            >
              {preview}
            </aside>
          )}
        </main>
      </div>
    </div>
  );
}
