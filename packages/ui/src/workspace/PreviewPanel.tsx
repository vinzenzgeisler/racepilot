import type { ReactNode } from 'react';
export function PreviewPanel({
  eyebrow,
  number,
  title,
  subtitle,
  imageUrl,
  imageAlt = '',
  labels,
  children,
  footer,
  onClose,
  closeLabel,
}: {
  eyebrow?: string;
  number?: string | null;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  imageAlt?: string;
  labels?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <section className="nb-preview-panel">
      {onClose && (
        <button
          className="nb-preview-close"
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
        >
          ×
        </button>
      )}
      {eyebrow && <p className="nb-preview-eyebrow">{eyebrow}</p>}
      <header>
        <strong className="nb-preview-number">{number || '—'}</strong>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      {labels && <div className="nb-preview-labels">{labels}</div>}
      {imageUrl ? (
        <img className="nb-preview-image" src={imageUrl} alt={imageAlt} />
      ) : (
        <div
          className="nb-preview-image nb-preview-image-empty"
          aria-label={imageAlt}
        >
          —
        </div>
      )}
      <div className="nb-preview-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}
