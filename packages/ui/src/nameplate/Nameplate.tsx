import React from 'react';

export function Nameplate({ name, detail }: { name: string; detail?: string }) {
  return (
    <span className="nb-nameplate">
      <strong>{name}</strong>
      {detail && <small>{detail}</small>}
    </span>
  );
}
