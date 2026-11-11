import React from 'react';

export function DataTable({
  headers,
  children,
  compact = false,
  header,
  className = '',
  headerCellClassNames,
}: {
  headers: string[];
  children: React.ReactNode;
  compact?: boolean;
  header?: React.ReactNode;
  className?: string;
  headerCellClassNames?: Array<string | undefined>;
}) {
  return (
    <div className={`nb-table-scroll ${className}`}>
      <table className={`nb-table ${compact ? 'nb-table-compact' : ''}`}>
        <thead>
          {header ?? (
            <tr>
              {headers.map((h, index) => (
                <th
                  key={h}
                  className={headerCellClassNames?.[index]}
                  scope="col"
                >
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
