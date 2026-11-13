import type { ReactNode } from 'react';

export type MetricTone = 'default' | 'attention';

/** Key figures of one view. Reads as a description list: label, then value. */
export function MetricGrid({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <dl className="nb-metric-grid" aria-label={label}>
      {children}
    </dl>
  );
}

/** One key figure. `attention` marks work that is waiting for someone. */
export function Metric({
  label,
  value,
  detail,
  tone = 'default',
  action,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: MetricTone;
  action?: ReactNode;
}) {
  return (
    <div className={`nb-metric${tone === 'attention' ? ' is-attention' : ''}`}>
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </dd>
      {action && <div className="nb-metric-action">{action}</div>}
    </div>
  );
}
