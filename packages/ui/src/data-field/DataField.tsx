import React from 'react';

export function DataField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nb-data-field">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
