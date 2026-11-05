import React from 'react';

export function DataTable({
  headers,
  children,
  compact = false,
  header,
  className = '',
}: {
  headers: string[];
  children: React.ReactNode;
  compact?: boolean;
  header?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`nb-table-scroll ${className}`}>
      <table className={`nb-table ${compact ? 'nb-table-compact' : ''}`}>
        <thead>
          {header ?? (
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
