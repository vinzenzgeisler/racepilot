import type { ReactNode } from 'react';
export function DetailHeader({
  backLabel,
  onBack,
  number,
  title,
  subtitle,
  meta,
  labels,
}: {
  backLabel: string;
  onBack: () => void;
  number?: string | null;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  labels?: ReactNode;
}) {
  return (
    <header className="nb-detail-head">
      <button type="button" className="nb-detail-back" onClick={onBack}>
        <span aria-hidden="true">←</span> {backLabel}
      </button>
      <div className="nb-detail-head-main">
        <strong className="nb-detail-number">{number || '—'}</strong>
        <div className="nb-detail-head-title">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {meta && <p className="nb-detail-meta">{meta}</p>}
      </div>
      {labels && <div className="nb-detail-labels">{labels}</div>}
    </header>
  );
}
