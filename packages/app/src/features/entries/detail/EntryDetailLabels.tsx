import { HintLabel, StatusLabel } from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { WorkflowView } from '../AdminEntriesModel.js';
import { statusMeaning } from '../EntryStatusBadge.js';
import { dimensionLabel } from './entryDetailModel.js';

const HINT_NAMES = {
  double_starter: 'Doppelstarter',
  passenger: 'Beifahrer',
  late_entry: 'Nachnennung',
} as const;
const ORDER = [
  'email_verification',
  'entry',
  'payment',
  'technical_inspection',
  'waiver',
];

export function EntryDetailLabels({
  entry,
  workflow,
}: {
  entry: Entry;
  workflow: WorkflowView | null;
}) {
  const projection = entry.statusProjection;
  return (
    <>
      {[...(projection?.dimensions ?? [])]
        .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
        .map((item) => (
          <StatusLabel
            key={item.key}
            status={
              item.key === 'entry'
                ? statusMeaning(
                    workflow?.statuses.find(
                      (status) => status.key === item.value,
                    )?.category ?? '',
                  )
                : item.key === 'payment' && item.meaning === 'not_relevant'
                  ? 'empty'
                  : item.meaning
            }
            label={dimensionLabel(item)}
          />
        ))}
      {(projection?.hints ?? [])
        .filter((hint) => hint.present)
        .map((hint) => (
          <HintLabel key={hint.key}>{HINT_NAMES[hint.key]}</HintLabel>
        ))}
    </>
  );
}
