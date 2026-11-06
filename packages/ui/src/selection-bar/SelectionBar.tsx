import React, { useEffect, useRef } from 'react';

export function SelectionBar({
  onAction,
  onClear,
  label,
  summary,
  actionLabel,
  actionDisabled = false,
  clearLabel,
}: {
  onAction?: () => void;
  onClear?: () => void;
  label: string;
  summary: string;
  actionLabel: string;
  actionDisabled?: boolean;
  clearLabel: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--nb-selection-height');
    root.dataset.nbSelectionBar = 'visible';
    const measure = () =>
      root.style.setProperty(
        '--nb-selection-height',
        `${barRef.current?.getBoundingClientRect().height ?? 72}px`,
      );
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    if (barRef.current) observer?.observe(barRef.current);
    return () => {
      observer?.disconnect();
      delete root.dataset.nbSelectionBar;
      if (previous) root.style.setProperty('--nb-selection-height', previous);
      else root.style.removeProperty('--nb-selection-height');
    };
  }, []);
  return (
    <div ref={barRef} className="nb-selection" role="region" aria-label={label}>
      <strong>{summary}</strong>
      <button type="button" onClick={onAction} disabled={actionDisabled}>
        {actionLabel}
      </button>
      <button type="button" onClick={onClear}>
        {clearLabel}
      </button>
    </div>
  );
}
