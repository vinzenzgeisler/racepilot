import type { ReactNode } from 'react';
/** Recorded acceptances: what was accepted, when, and (on request) the exact wording. */
export function EvidenceList({
  items,
  empty,
}: {
  items: Array<{
    id: string;
    title: ReactNode;
    /** Version, language, requirement – quiet details under the title. */
    meta?: ReactNode;
    /** Display time of the acceptance. */
    time: string;
    dateTime?: string;
    /** Label that opens the wording. */
    textLabel: string;
    /** Exact wording that was accepted; absent when it is no longer available. */
    text?: string | null;
    missingTextLabel: string;
  }>;
  empty?: ReactNode;
}) {
  if (!items.length) return <>{empty}</>;
  return (
    <ul className="nb-evidence-list">
      {items.map((item) => (
        <li key={item.id}>
          <div className="nb-evidence-head">
            <strong>{item.title}</strong>
            <time dateTime={item.dateTime}>{item.time}</time>
          </div>
          {item.meta && <p>{item.meta}</p>}
          {item.text ? (
            <details>
              <summary>{item.textLabel}</summary>
              <blockquote>{item.text}</blockquote>
            </details>
          ) : (
            <p className="nb-evidence-missing">{item.missingTextLabel}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
