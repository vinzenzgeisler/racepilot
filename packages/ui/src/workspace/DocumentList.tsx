import type { ReactNode } from 'react';
export function DocumentList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ id: string; label: string; status: ReactNode; href?: string }>;
  empty?: ReactNode;
}) {
  return (
    <section className="nb-document-list">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>
                {item.href ? <a href={item.href}>{item.label}</a> : item.label}
              </span>
              {item.status}
            </li>
          ))}
        </ul>
      ) : (
        empty
      )}
    </section>
  );
}
