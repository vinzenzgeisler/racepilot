import type { ReactNode } from 'react';
import { useWorkspacePreview } from './useWorkspacePreview.js';
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
  wide = false,
}: {
  filters?: ReactNode;
  children: ReactNode;
  preview?: ReactNode;
  previewLabel?: string;
  mobilePreviewOpen?: boolean | undefined;
  wide?: boolean | undefined;
}) {
  const previewAvailable = useWorkspacePreview();
  return (
    <div
      className={`nb-workspace-split${preview ? ' has-preview' : ''}${wide ? ' is-wide' : ''}`}
      data-preview-available={previewAvailable ? 'true' : 'false'}
    >
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
