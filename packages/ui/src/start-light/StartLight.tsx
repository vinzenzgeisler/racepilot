import React from 'react';

export function StartLight({
  state = 'ready',
  label,
}: {
  state?: 'ready' | 'loading' | 'go';
  label: string;
}) {
  return (
    <span
      className={`nb-start-light nb-light-${state}`}
      role="status"
      aria-label={label}
    >
      <i />
      <i />
      <i />
    </span>
  );
}
