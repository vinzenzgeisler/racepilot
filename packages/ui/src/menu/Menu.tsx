import React, { useEffect, useRef } from 'react';
import { Icon } from '../icon/Icon.js';

export function Menu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
        summaryRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return (
    <details ref={detailsRef} className="nb-menu">
      <summary ref={summaryRef} aria-label={label}>
        <Icon name="more" />
      </summary>
      <div
        className="nb-menu-disclosure"
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('button, a')
          ) {
            detailsRef.current!.open = false;
            summaryRef.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
}
