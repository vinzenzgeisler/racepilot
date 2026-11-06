import { DetailSection, HistoryTimeline } from '@racepilot/ui';
import { formatShortDateTime, type TimelineItem } from './entryDetailModel.js';

export function EntryHistorySection({ items }: { items: TimelineItem[] }) {
  return (
    <DetailSection title="Verlauf">
      <HistoryTimeline
        items={items.map((item) => ({
          id: item.id,
          title: item.title,
          time: formatShortDateTime(item.occurredAt),
          dateTime: item.occurredAt,
          actor: item.actor,
          tone: item.tone,
          detail: item.detail,
        }))}
        empty={<p>Noch keine Einträge.</p>}
      />
    </DetailSection>
  );
}
