import React from 'react';

export function StartLine({ children }: { children?: React.ReactNode }) {
  return (
    <div className="nb-start-line" aria-hidden="true">
      <span>{children}</span>
    </div>
  );
}
