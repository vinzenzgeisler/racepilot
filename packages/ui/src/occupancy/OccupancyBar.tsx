import type { CSSProperties } from 'react';

type OccupancyStyle = CSSProperties & Record<`--${string}`, string>;

const PERCENT = 100;

/** Share of the capacity that is taken, capped at the full bar. */
export function occupancyShare(occupied: number, capacity: number): number {
  if (capacity <= 0) return PERCENT;
  return Math.min(PERCENT, Math.round((occupied / capacity) * PERCENT));
}

/**
 * Occupancy of one class against its capacity. Without a capacity there is nothing to
 * measure against, so only the count is shown and no bar is drawn.
 */
export function OccupancyBar({
  label,
  occupied,
  capacity,
  unlimitedLabel,
  fullLabel,
  valueText,
}: {
  label: string;
  occupied: number;
  capacity: number | null;
  unlimitedLabel: string;
  fullLabel: string;
  valueText: string;
}) {
  const full = capacity !== null && occupied >= capacity;
  const style: OccupancyStyle = {
    '--nb-occupancy': `${capacity === null ? 0 : occupancyShare(occupied, capacity)}%`,
  };
  return (
    <div className={`nb-occupancy${full ? ' is-full' : ''}`}>
      <span className="nb-occupancy-label">{label}</span>
      {capacity === null ? (
        <span className="nb-occupancy-open">{unlimitedLabel}</span>
      ) : (
        <div
          className="nb-occupancy-track"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={Math.min(occupied, capacity)}
          aria-valuetext={valueText}
          style={style}
        />
      )}
      <span className="nb-occupancy-count">
        {occupied}
        {capacity !== null && ` / ${capacity}`}
        {full && <b>{fullLabel}</b>}
      </span>
    </div>
  );
}
