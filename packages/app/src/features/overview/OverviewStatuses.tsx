import type { EventOverview } from '@racepilot/contracts';
import { DataTable, DetailSection } from '@racepilot/ui';
import { statusRows } from './overviewModel.js';

export function OverviewStatuses({
  statuses,
}: {
  statuses: EventOverview['statuses'];
}) {
  const rows = statusRows(statuses);
  return (
    <DetailSection title="Nennungen je Status">
      {rows.length === 0 ? (
        <p className="overview-empty">Noch keine Nennungen.</p>
      ) : (
        <DataTable headers={['Status', 'Nennungen']} compact>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td className="overview-number">{row.count}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </DetailSection>
  );
}
