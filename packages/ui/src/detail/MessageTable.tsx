import type { ReactNode } from 'react';
/** Mails of one entry: a table on wide screens, stacked rows on narrow ones. */
export function MessageTable({
  headers,
  rows,
  empty,
}: {
  headers: { status: string; subject: string; template: string; sent: string };
  rows: Array<{
    id: string;
    status: ReactNode;
    subject: ReactNode;
    template: ReactNode;
    sent: ReactNode;
  }>;
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <table className="nb-message-table">
      <thead>
        <tr>
          {Object.values(headers).map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td data-label={headers.status}>{row.status}</td>
            <td data-label={headers.subject}>{row.subject}</td>
            <td data-label={headers.template}>{row.template}</td>
            <td data-label={headers.sent}>{row.sent}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
