import type { ReactNode } from 'react';
/** Picture next to its facts (vehicle photo and data); `below` spans the full width, e.g. an edit form. */
export function MediaDetail({
  imageUrl,
  imageAlt,
  caption,
  emptyLabel,
  children,
  below,
}: {
  imageUrl?: string | null;
  imageAlt: string;
  caption: string;
  /** Accessible name and caption shown when there is no picture. */
  emptyLabel: string;
  children?: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="nb-media-detail">
      <figure>
        {imageUrl ? (
          <img src={imageUrl} alt={imageAlt} />
        ) : (
          <div
            className="nb-media-detail-empty"
            role="img"
            aria-label={emptyLabel}
          >
            —
          </div>
        )}
        <figcaption>{imageUrl ? caption : emptyLabel}</figcaption>
      </figure>
      {children}
      {below && <div className="nb-media-detail-below">{below}</div>}
    </div>
  );
}
