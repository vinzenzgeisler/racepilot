import type { EventOverview } from '@racepilot/contracts';
import { Metric, MetricGrid } from '@racepilot/ui';
import { deadlineText, formatMoney, totalEntries } from './overviewModel.js';

export function OverviewMetrics({ overview }: { overview: EventOverview }) {
  const { openPayments, missingDocuments } = overview;
  const deadline = deadlineText(overview.daysUntilRegistrationCloses);
  return (
    <MetricGrid label="Kennzahlen der Veranstaltung">
      <Metric label="Nennungen" value={totalEntries(overview.statuses)} />
      <Metric
        label="Offene Zahlungen"
        value={openPayments.count}
        detail={formatMoney(openPayments.amountCents, openPayments.currency)}
        tone={openPayments.count > 0 ? 'attention' : 'default'}
      />
      <Metric
        label="Fehlende Unterlagen"
        value={missingDocuments.count}
        detail="Nennungen mit fehlender Pflichtunterlage"
        tone={missingDocuments.count > 0 ? 'attention' : 'default'}
      />
      <Metric
        label="Bis Nennungsschluss"
        value={deadline.value}
        detail={deadline.detail}
      />
    </MetricGrid>
  );
}
