import type { EventOverview } from '@racepilot/contracts';
import { Banner, Button } from '@racepilot/ui';
import {
  warningFilters,
  warningText,
  type EntryFilters,
} from './overviewModel.js';

export function OverviewWarnings({
  eventId,
  warnings,
  onOpenEntries,
}: {
  eventId: string;
  warnings: EventOverview['warnings'];
  onOpenEntries: (filters: EntryFilters) => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <section className="overview-warnings" aria-label="Warnungen">
      {warnings.map((warning) => {
        const filters = warningFilters(warning, eventId);
        return (
          <Banner key={warning.type} tone="warning">
            <span className="overview-warning">
              <span>{warningText(warning)}</span>
              {filters && (
                <Button
                  variant="secondary"
                  onClick={() => onOpenEntries(filters)}
                >
                  Nennungen anzeigen
                </Button>
              )}
            </span>
          </Banner>
        );
      })}
    </section>
  );
}
