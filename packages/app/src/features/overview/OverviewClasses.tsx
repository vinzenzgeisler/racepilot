import type { EventOverview } from '@racepilot/contracts';
import { DetailSection, OccupancyBar } from '@racepilot/ui';

const valueText = (occupied: number, capacity: number | null): string =>
  capacity === null
    ? `${occupied} belegt, ohne Limit`
    : `${occupied} von ${capacity} belegt`;

export function OverviewClasses({
  classes,
}: {
  classes: EventOverview['classes'];
}) {
  return (
    <DetailSection title="Belegung je Klasse">
      {classes.length === 0 ? (
        <p className="overview-empty">
          Für diese Veranstaltung sind noch keine Klassen angelegt.
        </p>
      ) : (
        <div className="overview-classes">
          {classes.map((item) => (
            <OccupancyBar
              key={item.classId}
              label={item.name}
              occupied={item.occupied}
              capacity={item.capacity}
              unlimitedLabel="Ohne Limit"
              fullLabel="Voll"
              valueText={valueText(item.occupied, item.capacity)}
            />
          ))}
        </div>
      )}
    </DetailSection>
  );
}
