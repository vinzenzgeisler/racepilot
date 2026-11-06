import type { ReactNode } from 'react';
export type HistoryTone = 'dark' | 'accent' | 'open';
export function HistoryTimeline({
  title,
  items,
  empty,
}: {
  title?: string;
  items: Array<{
    id: string;
    title: ReactNode;
    /** Display time, for example "05.09. 08:40". */
    time: string;
    dateTime?: string;
    actor?: string;
    detail?: ReactNode;
    tone?: HistoryTone;
  }>;
  empty?: ReactNode;
}) {
  return (
    <section className="nb-history-timeline">
      {title && <h3>{title}</h3>}
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.id} className={`is-${item.tone ?? 'dark'}`}>
              <strong>{item.title}</strong>
              <p>
                <time dateTime={item.dateTime}>{item.time}</time>
                {item.actor && <span> · {item.actor}</span>}
              </p>
              {item.detail && <div>{item.detail}</div>}
            </li>
          ))}
        </ol>
      ) : (
        empty
      )}
    </section>
  );
}
