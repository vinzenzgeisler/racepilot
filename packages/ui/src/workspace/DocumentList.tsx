import type { ReactNode } from 'react';
export function DocumentList({
  title,
  items,
  empty,
}: {
  title?: string;
  items: Array<{
    id: string;
    label: string;
    status: ReactNode;
    href?: string;
    /** Trailing action such as "Ansehen"; sits right of the status. */
    action?: ReactNode;
    /** Bold row, used for the document that blocks the next step. */
    emphasis?: boolean;
  }>;
  empty?: ReactNode;
}) {
  return (
    <section className="nb-document-list">
      {title && <h3>{title}</h3>}
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id} className={item.emphasis ? 'is-emphasis' : ''}>
              <span>
                {item.href ? <a href={item.href}>{item.label}</a> : item.label}
              </span>
              <span className="nb-document-list-end">
                {item.status}
                {item.action}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        empty
      )}
    </section>
  );
}
