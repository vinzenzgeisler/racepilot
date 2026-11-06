import type { ReactNode } from 'react';
export function HistoryTimeline({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ id: string; time: string; content: ReactNode }>;
  empty?: ReactNode;
}) {
  return (
    <section className="nb-history-timeline">
      <h3>{title}</h3>
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <time>{item.time}</time>
              <div>{item.content}</div>
            </li>
          ))}
        </ol>
      ) : (
        empty
      )}
    </section>
  );
}
