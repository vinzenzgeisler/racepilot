import type { Dispatch, SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { Button, DataTable } from '@racepilot/ui';
import type {
  ApiState,
  EntryQuery,
  WorkflowView,
} from './AdminEntriesModel.js';
import { AdminEntryRow } from './AdminEntryRow.js';
import { AdminEntryFilters } from './AdminEntryFilters.js';
import { AdminEntryPagination } from './AdminEntryPagination.js';
import { AdminEntryListStatus } from './AdminEntryListStatus.js';

type Selection = { eventId: string; ids: Set<string> };
type Props = {
  eventId: string;
  apiState: ApiState;
  draft: EntryQuery;
  setDraft: Dispatch<SetStateAction<EntryQuery>>;
  changeSort: (sort: string, direction?: string) => void;
  classes: Array<{ id: string; name: string }>;
  workflow: WorkflowView | null;
  counts: Record<string, number>;
  total: number;
  items: Entry[];
  selected: Entry | null;
  selectedIds: Set<string>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  openEntry: (id: string) => Promise<void>;
  eligibleSelectedItems: Entry[];
  busy: boolean;
  clearSelection: () => void;
  bulkAccept: () => Promise<void>;
  page: number;
  totalPages: number;
  setPage: Dispatch<SetStateAction<number>>;
};
export function AdminEntryList(props: Props) {
  const {
    eventId,
    apiState,
    draft,
    setDraft,
    changeSort,
    classes,
    workflow,
    counts,
    total,
    items,
    selected,
    selectedIds,
    setSelection,
    openEntry,
    eligibleSelectedItems,
    busy,
    clearSelection,
    bulkAccept,
    page,
    totalPages,
    setPage,
  } = props;
  if (!eventId) return null;
  const countAll = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return (
    <>
      <AdminEntryFilters
        draft={draft}
        setDraft={setDraft}
        changeSort={changeSort}
        classes={classes}
      />
      <nav className="entry-status-tabs" aria-label="Nennungsstatus">
        <Button
          variant="text"
          size={32}
          className={!draft.acceptanceStatus ? 'is-active' : ''}
          onClick={() =>
            setDraft((value) => ({ ...value, acceptanceStatus: '' }))
          }
        >
          Alle <strong>{countAll}</strong>
        </Button>
        {[...(workflow?.statuses ?? [])]
          .sort(
            (a, b) =>
              [
                'pending',
                'waitlisted',
                'accepted',
                'rejected',
                'withdrawn',
              ].indexOf(a.category) -
              [
                'pending',
                'waitlisted',
                'accepted',
                'rejected',
                'withdrawn',
              ].indexOf(b.category),
          )
          .map((status) => (
            <Button
              key={status.key}
              variant="text"
              size={32}
              className={
                draft.acceptanceStatus === status.key ? 'is-active' : ''
              }
              onClick={() =>
                setDraft((value) => ({
                  ...value,
                  acceptanceStatus: status.key,
                }))
              }
            >
              {status.labels.de} <strong>{counts[status.key] ?? 0}</strong>
            </Button>
          ))}
      </nav>
      <AdminEntryListStatus apiState={apiState} total={total} />
      <DataTable
        headers={[]}
        className="admin-table-wrap"
        header={
          <tr>
            <th className="entry-select-col">
              <span className="sr-only">Auswahl</span>
            </th>
            <th>Nennung</th>
            <th>Klasse</th>
            <th>Nr.</th>
            <th>Status</th>
            <th>Zahlung</th>
            <th>Abnahme</th>
            <th>Haftverzicht</th>
            <th>
              <span className="sr-only">Aktionen</span>
            </th>
          </tr>
        }
      >
        {apiState === 'ready' &&
          items.map((entry) => (
            <AdminEntryRow
              key={entry.id}
              entry={entry}
              eventId={eventId}
              selected={selected}
              selectedIds={selectedIds}
              setSelection={setSelection}
              classes={classes}
              workflow={workflow}
              openEntry={openEntry}
            />
          ))}
        {apiState === 'ready' && !items.length && (
          <tr>
            <td colSpan={9}>Keine Nennungen für diese Filter.</td>
          </tr>
        )}
      </DataTable>
      {selectedIds.size > 0 && (
        <div
          className="entry-selection-bar"
          role="toolbar"
          aria-label="Massenaktionen"
        >
          <strong>
            {selectedIds.size} von {total} ausgewählt
          </strong>
          <Button variant="text" size={40} onClick={clearSelection}>
            Auswahl aufheben
          </Button>
          <Button
            variant="primary"
            size={40}
            disabled={busy || eligibleSelectedItems.length === 0}
            onClick={() => void bulkAccept()}
          >
            Zulassen ({eligibleSelectedItems.length} von {selectedIds.size})
          </Button>
        </div>
      )}
      <AdminEntryPagination
        page={page}
        totalPages={totalPages}
        apiState={apiState}
        clearSelection={clearSelection}
        setPage={setPage}
      />
    </>
  );
}
