import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { DataTable, SelectionBar, Tabs, WorkspaceSplit } from '@racepilot/ui';
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
  preview?: ReactNode;
  mobilePreviewOpen?: boolean | undefined;
  wide?: boolean | undefined;
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
    preview,
    mobilePreviewOpen,
    wide,
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
  const content = (
    <>
      <AdminEntryListStatus apiState={apiState} total={total} />
      <DataTable
        headers={[
          'Nennung',
          'Klasse',
          'Nr.',
          'Status',
          'Zahlung',
          'Abnahme',
          'Haftverzicht',
          '',
        ]}
        headerCellPriorities={[undefined, 2, 1, undefined, undefined, 3, 3, 1]}
        headerCellClassNames={[
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'nb-entry-list-inspection',
          'nb-entry-list-waiver',
          undefined,
        ]}
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
            <td colSpan={8}>Keine Nennungen für diese Filter.</td>
          </tr>
        )}
      </DataTable>
      <AdminEntryPagination
        page={page}
        totalPages={totalPages}
        apiState={apiState}
        clearSelection={clearSelection}
        setPage={setPage}
      />
    </>
  );
  const tabs = [
    { id: 'all', label: `Alle ${countAll}`, content },
    ...(workflow?.statuses ?? []).map((status) => ({
      id: status.key,
      label: `${status.labels.de} ${counts[status.key] ?? 0}`,
      content,
    })),
  ];
  return (
    <WorkspaceSplit
      previewLabel="Nennungsvorschau"
      preview={preview}
      mobilePreviewOpen={mobilePreviewOpen}
      wide={wide}
      filters={
        <AdminEntryFilters
          draft={draft}
          setDraft={setDraft}
          changeSort={changeSort}
          classes={classes}
        />
      }
    >
      <Tabs
        tabs={tabs}
        selected={draft.acceptanceStatus || 'all'}
        label="Nennungsstatus"
        onChange={(id) =>
          setDraft((value) => ({
            ...value,
            acceptanceStatus: id === 'all' ? '' : id,
          }))
        }
      />
      {selectedIds.size > 0 && (
        <SelectionBar
          label="Massenaktionen"
          summary={`${selectedIds.size} von ${total} ausgewählt`}
          clearLabel="Auswahl aufheben"
          onClear={clearSelection}
          actionLabel={`Zulassen (${eligibleSelectedItems.length} von ${selectedIds.size})`}
          actionDisabled={busy || eligibleSelectedItems.length === 0}
          onAction={() => void bulkAccept()}
        />
      )}
    </WorkspaceSplit>
  );
}
