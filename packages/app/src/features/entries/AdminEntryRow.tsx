import type { Dispatch, SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import {
  Button,
  Checkbox,
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
    <StatusLabel status={dimension.meaning} label={dimension.label.de} />
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
}: {
  entry: Entry;
  eventId: string;
  selected: Entry | null;
  selectedIds: Set<string>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  classes: Array<{ id: string; name: string }>;
  workflow: WorkflowView | null;
  openEntry: (id: string) => Promise<void>;
}) {
  return (
    <tr
      key={entry.id}
      className={`entry-row${selected?.id === entry.id ? ' is-selected' : ''}`}
      onClick={() => void openEntry(entry.id)}
    >
      <td
        className="entry-select-col"
        onClick={(event) => event.stopPropagation()}
      >
        <Checkbox
          visuallyHiddenLabel
          label={`${entry.adminDetails?.driver.name ?? 'Nennung'} auswählen`}
          checked={selectedIds.has(entry.id)}
          onChange={(event) =>
            setSelection((current) => {
              const next = new Set(
                current.eventId === eventId ? current.ids : [],
              );
              if (event.target.checked) next.add(entry.id);
              else next.delete(entry.id);
              return { eventId, ids: next };
            })
          }
        />
      </td>
      <td>
        <div className="entry-person-cell">
          {entry.adminDetails?.vehicle.imageUrl ? (
            <img
              className="entry-vehicle-image"
              src={entry.adminDetails.vehicle.imageUrl}
              alt=""
            />
          ) : (
            <span
              className="entry-vehicle-image entry-image-missing"
              aria-label="Kein Fahrzeugbild"
            >
              —
            </span>
          )}
          <div className="entry-person-text">
            <strong className="entry-driver-name">
              {entry.adminDetails?.driver.name ?? 'Name nicht verfügbar'}
            </strong>
            <small>
              {entry.adminDetails
                ? `${entry.adminDetails.vehicle.make} ${entry.adminDetails.vehicle.model}`
                : 'Fahrzeug nicht verfügbar'}
              {entry.adminDetails?.vehicle.registration
                ? ` · ${entry.adminDetails.vehicle.registration}`
                : ''}
            </small>
            {entry.statusProjection?.hints
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
          </div>
        </div>
      </td>
      <td>
        {entry.adminDetails?.eventClass.name ??
          classes.find((item) => item.id === entry.classId)?.name ??
          '—'}
      </td>
      <td>
        <strong className="app-start-number">
          {entry.requestedStartNumber ?? entry.adminDetails?.startNumber ?? '—'}
        </strong>
      </td>
      <td>
        <EntryStatusBadge
          status={workflow?.statuses.find(
            (status) => status.key === entry.acceptanceStatus,
          )}
          fallback={entry.acceptanceStatus}
        />
      </td>
      <td>
        <Dimension entry={entry} keyName="payment" />
      </td>
      <td>
        <Dimension entry={entry} keyName="technical_inspection" />
      </td>
      <td>
        <Dimension entry={entry} keyName="waiver" />
      </td>
      <td onClick={(event) => event.stopPropagation()}>
        <Button
          variant="text"
          size={32}
          data-selected-entry={selected?.id === entry.id ? true : undefined}
          data-entry-action={entry.id}
          className="entry-open-button"
          onClick={() => void openEntry(entry.id)}
          aria-label={`${entry.adminDetails?.driver.name ?? 'Nennung'} öffnen`}
        >
          Öffnen
        </Button>
        <Menu label="Weitere Aktionen">
          <MenuItem onClick={() => void openEntry(entry.id)}>
            Vorschau öffnen
          </MenuItem>
        </Menu>
      </td>
    </tr>
  );
}
