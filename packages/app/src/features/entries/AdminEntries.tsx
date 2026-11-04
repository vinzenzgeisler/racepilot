import { useEffect, useState, type FormEvent } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { initialQuery, type EntryQuery } from './AdminEntriesModel.js';
import { AdminWorkflow } from '../workflow/AdminWorkflow.js';
import { AdminEntryDetail } from './AdminEntryDetail.js';
import { AdminEntryList } from './AdminEntryList.js';
import { useAdminEntryActions } from './useAdminEntryActions.js';
import { useAdminEntriesData } from './useAdminEntriesData.js';
export function AdminEntries({
  onSelectionChange,
  eventId: sharedEventId,
  onEventChange: onSharedEventChange,
}: {
  onSelectionChange?: (entry: Entry | null) => void;
  eventId?: string;
  onEventChange?: (id: string) => void;
} = {}) {
  const [localEventId, setLocalEventId] = useState('');
  const eventId = sharedEventId ?? localEventId;
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [draft, setDraft] = useState<EntryQuery>(initialQuery);
  const [applied, setApplied] = useState<EntryQuery>(initialQuery);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [actionError, setActionError] = useState('');
  const [selection, setSelection] = useState<{
    eventId: string;
    ids: Set<string>;
  }>({ eventId, ids: new Set() });
  const selectedIds =
    selection.eventId === eventId ? selection.ids : new Set<string>();
  const clearSelection = () => setSelection({ eventId, ids: new Set() });
  const {
    apiState,
    events,
    workflow,
    items,
    total,
    totalPages,
    classes,
    resetData,
  } = useAdminEntriesData({
    eventId,
    page,
    pageSize,
    applied,
    refreshRevision,
    setActionError,
  });
  const {
    reason,
    setReason,
    busy,
    setBusy,
    openEntry,
    transition,
    acceptedStatusKey,
    eligibleSelectedItems,
    bulkAccept,
    invalidateActionRequests,
  } = useAdminEntryActions({
    eventId,
    items,
    workflow,
    selected,
    setSelected,
    selectedIds,
    clearSelection,
    setRefreshRevision,
    setActionError,
  });
  useEffect(() => onSelectionChange?.(selected), [onSelectionChange, selected]);
  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (
        !items.length ||
        (event.target instanceof HTMLElement &&
          ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName))
      )
        return;
      const index = items.findIndex((item) => item.id === selected?.id);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = Math.min(
          items.length - 1,
          Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)),
        );
        document
          .querySelector<HTMLButtonElement>(
            `[data-entry-action="${items[next]!.id}"]`,
          )
          ?.click();
      } else if (event.key === 'Escape' && selected) {
        setSelected(null);
      } else if (event.key === 'Enter') {
        const focusedAction = (
          event.target as HTMLElement | null
        )?.closest<HTMLButtonElement>('[data-entry-action]');
        (
          focusedAction ??
          document.querySelector<HTMLButtonElement>('[data-selected-entry]')
        )?.click();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => document.removeEventListener('keydown', handleKeys);
  }, [items, selected]);
  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    clearSelection();
    setApplied({ ...draft });
  }

  function changeEvent(nextEventId: string) {
    resetData();
    invalidateActionRequests();
    if (onSharedEventChange) onSharedEventChange(nextEventId);
    else setLocalEventId(nextEventId);
    setPage(1);
    clearSelection();
    setDraft({ ...initialQuery });
    setApplied({ ...initialQuery });
    setSelected(null);
    setReason('');
    setActionError('');
    setBusy(false);
  }

  function changeSort(nextSort: string, nextDirection = draft.direction) {
    setDraft((value) => ({
      ...value,
      sort: nextSort,
      direction: nextDirection,
    }));
    setPage(1);
    clearSelection();
    setApplied((value) => ({
      ...value,
      sort: nextSort,
      direction: nextDirection,
    }));
  }

  if (apiState === 'loading' && events.length === 0)
    return <p role="status">Loading administration…</p>;
  if (apiState === 'unauthorized')
    return (
      <section className="admin-state">
        <h2>Sign-in required</h2>
        <p role="alert">
          The API returned 401. An OIDC client session/login flow is not
          available in this app yet.
        </p>
      </section>
    );
  if (apiState === 'forbidden')
    return (
      <section className="admin-state">
        <h2>Access denied</h2>
        <p role="alert">
          Your account does not have permission to view administration events.
        </p>
      </section>
    );
  if (apiState === 'unavailable' && events.length === 0)
    return (
      <section className="admin-state">
        <h2>Administration unavailable</h2>
        <p role="alert">
          Could not load organization events. No public event data is used as a
          fallback.
        </p>
      </section>
    );

  return (
    <section className="admin-entries" aria-labelledby="admin-entries-title">
      <h2 id="admin-entries-title">Nennungen</h2>
      <label>
        Event
        <select
          aria-label="Event"
          value={eventId}
          onChange={(e) => changeEvent(e.target.value)}
        >
          <option value="">Select an event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </label>
      <AdminWorkflow eventId={eventId} events={events} />
      <AdminEntryList
        eventId={eventId}
        apiState={apiState}
        draft={draft}
        setDraft={setDraft}
        changeSort={changeSort}
        applyFilters={applyFilters}
        classes={classes}
        workflow={workflow}
        total={total}
        items={items}
        selected={selected}
        selectedIds={selectedIds}
        setSelection={setSelection}
        openEntry={openEntry}
        acceptedStatusKey={acceptedStatusKey}
        eligibleSelectedItems={eligibleSelectedItems}
        busy={busy}
        clearSelection={clearSelection}
        bulkAccept={bulkAccept}
        page={page}
        totalPages={totalPages}
        setPage={setPage}
      />
      {selected && (
        <AdminEntryDetail
          selected={selected}
          classes={classes}
          workflow={workflow}
          reason={reason}
          setReason={setReason}
          busy={busy}
          transition={transition}
        />
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </section>
  );
}
