import type { Dispatch, SetStateAction, FormEvent } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import {
  Button,
  Checkbox,
  DataTable,
  HintLabel,
  Menu,
  MenuItem,
} from '@racepilot/ui';
import type {
  ApiState,
  EntryQuery,
  WorkflowView,
} from './AdminEntriesModel.js';
import { EntryStatusBadge } from './EntryStatusBadge.js';
import { AdminEntryFilters } from './AdminEntryFilters.js';
import { AdminEntryPagination } from './AdminEntryPagination.js';
import { AdminEntryListStatus } from './AdminEntryListStatus.js';

type Selection = { eventId: string; ids: Set<string> };

export function AdminEntryList({
  eventId,
  apiState,
  draft,
  setDraft,
  changeSort,
  applyFilters,
  classes,
  workflow,
  total,
  items,
  selected,
  selectedIds,
  setSelection,
  openEntry,
  acceptedStatusKey,
  eligibleSelectedItems,
  busy,
  clearSelection,
  bulkAccept,
  page,
  totalPages,
  setPage,
}: {
  eventId: string;
  apiState: ApiState;
  draft: EntryQuery;
  setDraft: Dispatch<SetStateAction<EntryQuery>>;
  changeSort: (sort: string, direction?: string) => void;
  applyFilters: (event: FormEvent) => void;
  classes: Array<{ id: string; name: string }>;
  workflow: WorkflowView | null;
  total: number;
  items: Entry[];
  selected: Entry | null;
  selectedIds: Set<string>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  openEntry: (id: string) => Promise<void>;
  acceptedStatusKey: string | undefined;
  eligibleSelectedItems: Entry[];
  busy: boolean;
  clearSelection: () => void;
  bulkAccept: () => Promise<void>;
  page: number;
  totalPages: number;
  setPage: Dispatch<SetStateAction<number>>;
}) {
  return eventId ? (
    <>
      <AdminEntryFilters
        draft={draft}
        setDraft={setDraft}
        changeSort={changeSort}
        applyFilters={applyFilters}
        classes={classes}
        workflow={workflow}
      />
      <AdminEntryListStatus apiState={apiState} total={total} />
      <DataTable
        headers={[]}
        className="admin-table-wrap"
        header={
          <tr>
            <th data-priority="1">
              <span className="sr-only">Auswahl</span>
            </th>
            <th data-priority="1">Nennung</th>
            <th data-priority="2">Klasse</th>
            <th data-priority="1">Nr.</th>
            <th data-priority="1">Status</th>
            <th data-priority="2">Zahlung</th>
            <th data-priority="3">Prüfstatus</th>
            <th data-priority="1">Aktion</th>
            <th data-priority="4">Eingang</th>
          </tr>
        }
      >
        {apiState === 'ready' &&
          items.map((entry) => (
            <tr
              key={entry.id}
              className={selected?.id === entry.id ? 'is-selected' : ''}
              onClick={() => void openEntry(entry.id)}
            >
              <td
                data-priority="1"
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  label={`Nennung ${entry.adminDetails?.driver.name ?? 'unbekannt'} auswählen`}
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
              <td data-priority="1">
                {entry.adminDetails?.vehicle && (
                  <span
                    className="entry-vehicle-placeholder"
                    aria-label="Kein Fahrzeugbild verfügbar"
                  >
                    ▧
                  </span>
                )}
                <span className="entry-driver-name">
                  {entry.adminDetails?.driver.name ?? entry.id}
                </span>
                {entry.adminDetails?.driver.email && (
                  <small>
                    {entry.adminDetails.driver.email}
                    {entry.adminDetails.driver.emailVerified ? ' ✓' : ''}
                  </small>
                )}
                {entry.adminDetails && (
                  <small className="entry-vehicle-name">
                    {entry.adminDetails.vehicle.make}{' '}
                    {entry.adminDetails.vehicle.model}
                  </small>
                )}
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
              </td>
              <td data-priority="2">
                {entry.adminDetails?.eventClass.name ??
                  classes.find((item) => item.id === entry.classId)?.name ??
                  entry.classId}
              </td>
              <td data-priority="1">
                <strong className="app-start-number">
                  {entry.adminDetails?.startNumber ?? '—'}
                </strong>
              </td>
              <td data-priority="1">
                <EntryStatusBadge
                  status={workflow?.statuses.find(
                    (item) => item.key === entry.acceptanceStatus,
                  )}
                  fallback={entry.acceptanceStatus}
                />
              </td>
              <td data-priority="2">
                {entry.statusProjection?.dimensions.find(
                  (item) => item.key === 'payment',
                )?.label.de ?? '—'}
              </td>
              <td
                data-priority="3"
                title={entry.statusProjection?.dimensions
                  .filter((item) =>
                    ['technical_inspection', 'waiver', 'payment'].includes(
                      item.key,
                    ),
                  )
                  .map((item) => item.label.de)
                  .join(' · ')}
              >
                {entry.statusProjection?.dimensions
                  .filter((item) =>
                    ['technical_inspection', 'waiver'].includes(item.key),
                  )
                  .map((item) => item.label.de)
                  .join(' · ') || '—'}
              </td>
              <td
                data-priority="1"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="entry-row-actions">
                  <Button
                    variant="text"
                    size={32}
                    data-selected-entry={
                      selected?.id === entry.id ? true : undefined
                    }
                    data-entry-action={entry.id}
                    onClick={() => void openEntry(entry.id)}
                  >
                    {entry.statusProjection?.dimensions.find(
                      (item) => item.nextAction,
                    )?.nextAction?.label.de ?? 'Öffnen'}
                  </Button>
                  {(() => {
                    const rowTransitions = (workflow?.transitions ?? [])
                      .filter((edge) => edge.from === entry.acceptanceStatus)
                      .filter((edge) => edge.to !== acceptedStatusKey);
                    const hasVerificationAction =
                      entry.verificationStatus !== 'verified';
                    if (rowTransitions.length === 0 && !hasVerificationAction)
                      return null;
                    return (
                      <Menu label="Weitere Aktionen">
                        {rowTransitions.map((edge) => {
                          const status = workflow?.statuses.find(
                            (item) => item.key === edge.to,
                          );
                          return (
                            <MenuItem
                              key={edge.to}
                              onClick={() => void openEntry(entry.id)}
                            >
                              {status?.labels.de ?? edge.to} …
                            </MenuItem>
                          );
                        })}
                        {hasVerificationAction && (
                          <MenuItem onClick={() => void openEntry(entry.id)}>
                            Verifikation …
                          </MenuItem>
                        )}
                      </Menu>
                    );
                  })()}
                </div>
              </td>
              <td data-priority="4">
                {new Intl.DateTimeFormat('de-DE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/Berlin',
                }).format(new Date(entry.createdAt))}
              </td>
            </tr>
          ))}
        {apiState === 'ready' && items.length === 0 && (
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
          <Button variant="text" size={40} onClick={() => clearSelection()}>
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
  ) : null;
}
