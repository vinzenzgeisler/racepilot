import type { ReactNode } from 'react';
/**
 * Filters span the full width; below them the content sits next to the
 * preview, both starting on the same line. Layout is pure CSS grid.
 */
export function WorkspaceSplit({
  filters,
  children,
  preview,
  previewLabel,
  mobilePreviewOpen = false,
}: {
  filters?: ReactNode;
  children: ReactNode;
  preview?: ReactNode;
  previewLabel?: string;
  mobilePreviewOpen?: boolean | undefined;
}) {
  return (
    <div className={`nb-workspace-split${preview ? ' has-preview' : ''}`}>
      {filters && <div className="nb-workspace-split-filters">{filters}</div>}
      <div className="nb-workspace-split-content">{children}</div>
      {preview && (
        <aside
          className={`nb-workspace-split-preview${mobilePreviewOpen ? ' is-mobile-open' : ''}`}
          aria-label={previewLabel}
        >
          {preview}
        </aside>
      )}
    </div>
  );
}
