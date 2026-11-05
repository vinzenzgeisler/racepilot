import React from 'react';

export function DataTable({
  headers,
  children,
  compact = false,
}: {
  headers: string[];
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="nb-table-scroll">
      <table className={`nb-table ${compact ? 'nb-table-compact' : ''}`}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
