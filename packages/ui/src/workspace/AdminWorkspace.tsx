import type { ReactNode } from 'react';
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
  return (
    <div className="nb-admin-workspace">
      {navigation}
      <div className="nb-admin-workspace-body">
        {header}
        <main className="nb-admin-workspace-main">
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
