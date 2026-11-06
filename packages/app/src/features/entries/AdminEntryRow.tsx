import type { Dispatch, SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import {
  Button,
  EntryListRow,
  HintLabel,
  Menu,
  MenuItem,
  StatusLabel,
} from '@racepilot/ui';
import type { WorkflowView } from './AdminEntriesModel.js';
import { EntryStatusBadge } from './EntryStatusBadge.js';
type Selection = { eventId: string; ids: Set<string> };
function Dimension({
  entry,
  keyName,
}: {
  entry: Entry;
  keyName: 'payment' | 'technical_inspection' | 'waiver';
}) {
  const dimension = entry.statusProjection?.dimensions.find(
    (item) => item.key === keyName,
  );
  return dimension ? (
    <StatusLabel
      status={
        dimension.meaning === 'not_relevant' ? 'empty' : dimension.meaning
      }
      label={dimension.label.de}
    />
  ) : (
    <span>—</span>
  );
}
export function AdminEntryRow({
  entry,
  eventId,
  selected,
  selectedIds,
  setSelection,
  classes,
  workflow,
  openEntry,
  openEntryDetail,
}: {
  entry: Entry;
  eventId: string;
  selected: Entry | null;
  selectedIds: Set<string>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  classes: Array<{ id: string; name: string }>;
  workflow: WorkflowView | null;
  openEntry: (id: string) => Promise<void>;
  openEntryDetail: (id: string) => Promise<void>;
}) {
  const details = entry.adminDetails;
  const name = details?.driver.name ?? 'Name nicht verfügbar';
  const vehicle = details
    ? `${details.vehicle.make} ${details.vehicle.model}${details.vehicle.registration ? ` · ${details.vehicle.registration}` : ''}`
    : 'Fahrzeug nicht verfügbar';
  return (
    <EntryListRow
      name={name}
      vehicle={vehicle}
      imageUrl={details?.vehicle.imageUrl ?? null}
      imageAlt="Fahrzeugbild"
      hints={entry.statusProjection?.hints
        .filter((hint) => hint.present)
        .map((hint) => (
          <HintLabel key={hint.key}>
            {hint.key === 'double_starter'
              ? 'Doppelstarter'
              : hint.key === 'passenger'
                ? 'Beifahrer'
                : 'Nachnennung'}
          </HintLabel>
        ))}
      className={
        details?.eventClass.name ??
        classes.find((item) => item.id === entry.classId)?.name ??
        '—'
      }
      number={entry.requestedStartNumber ?? details?.startNumber ?? null}
      selected={selected?.id === entry.id}
      checked={selectedIds.has(entry.id)}
      selectLabel={`${name} auswählen`}
      onSelect={(checked) =>
        setSelection((current) => {
          const ids = new Set(current.eventId === eventId ? current.ids : []);
          if (checked) ids.add(entry.id);
          else ids.delete(entry.id);
          return { eventId, ids };
        })
      }
      onOpen={() => void openEntry(entry.id)}
      status={
        <EntryStatusBadge
          status={workflow?.statuses.find(
            (status) => status.key === entry.acceptanceStatus,
          )}
          fallback={entry.acceptanceStatus}
        />
      }
      payment={<Dimension entry={entry} keyName="payment" />}
      inspection={<Dimension entry={entry} keyName="technical_inspection" />}
      waiver={<Dimension entry={entry} keyName="waiver" />}
      nextAction={
        <Button
          variant="text"
          size={32}
          aria-label={`${name} vollständig öffnen`}
          onClick={() => void openEntryDetail(entry.id)}
        >
          Öffnen
        </Button>
      }
      openActionId={entry.id}
      menu={
        <Menu label={`Weitere Aktionen für ${name}`}>
          <MenuItem onClick={() => void openEntry(entry.id)}>
            Vorschau öffnen
          </MenuItem>
        </Menu>
      }
    />
  );
}
