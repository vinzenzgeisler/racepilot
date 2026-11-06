import { useCallback, useEffect, useRef, useState } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { Button, SelectField } from '@racepilot/ui';
import { initialQuery, request, type EntryQuery } from './AdminEntriesModel.js';
import { AdminEntryDetail } from './AdminEntryDetail.js';
import { AdminEntryList } from './AdminEntryList.js';
import { useAdminEntryActions } from './useAdminEntryActions.js';
import { useAdminEntriesData } from './useAdminEntriesData.js';
import { useAdminEntriesKeyboard } from './useAdminEntriesKeyboard.js';
export function AdminEntries({
  detailOpen,
  autoPreview = false,
  onOpenDetail,
  onCloseDetail,
  onSelectionChange,
  onTotalChange,
  eventId: sharedEventId,
  onEventChange: onSharedEventChange,
}: {
  detailOpen?: boolean;
  autoPreview?: boolean;
  onOpenDetail?: () => void;
  onCloseDetail?: () => void;
  onSelectionChange?: (entry: Entry | null) => void;
  onTotalChange?: (total: number) => void;
  eventId?: string;
  onEventChange?: (id: string) => void;
} = {}) {
  const [internalDetailOpen, setInternalDetailOpen] = useState(false);
  const autoPreviewedEvent = useRef('');
  const isDetailOpen = detailOpen ?? internalDetailOpen;
  const openDetail = useCallback(() => {
    if (onOpenDetail) onOpenDetail();
    else setInternalDetailOpen(true);
  }, [onOpenDetail]);
  const closeDetail = useCallback(() => {
    if (onCloseDetail) onCloseDetail();
    else setInternalDetailOpen(false);
  }, [onCloseDetail]);
  const [localEventId, setLocalEventId] = useState('');
  const eventId = sharedEventId ?? localEventId;
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [draft, setDraft] = useState<EntryQuery>(initialQuery);
  const [applied, setApplied] = useState<EntryQuery>(initialQuery);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [actionError, setActionError] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    request(`/admin/events/${encodeURIComponent(eventId)}/entry-counts`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { total: number; statuses: Record<string, number> }) => {
        if (!controller.signal.aborted) {
          setCounts(data.statuses);
          onTotalChange?.(data.total);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [eventId, refreshRevision, onTotalChange]);
  const [selection, setSelection] = useState<{
    eventId: string;
    ids: Set<string>;
  }>({ eventId, ids: new Set() });
  const selectedIds =
    selection.eventId === eventId ? selection.ids : new Set<string>();
  const clearSelection = useCallback(
    () => setSelection({ eventId, ids: new Set() }),
    [eventId],
  );
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
    if (
      !autoPreview ||
      !eventId ||
      !items.length ||
      autoPreviewedEvent.current === eventId ||
      !workflow
    )
      return;
    autoPreviewedEvent.current = eventId;
    const firstPending = items.find(
      (item) =>
        workflow.statuses.find((status) => status.key === item.acceptanceStatus)
          ?.category === 'waitlisted',
    );
    void openEntry((firstPending ?? items[0]!).id);
  }, [autoPreview, eventId, items, workflow, openEntry]);
  useEffect(() => {
    const refresh = () => setRefreshRevision((value) => value + 1);
    window.addEventListener('nennbox:entries-changed', refresh);
    return () => window.removeEventListener('nennbox:entries-changed', refresh);
  }, []);
  useAdminEntriesKeyboard({
    items,
    selected,
    isDetailOpen,
    openEntry,
    openDetail,
    closeDetail,
    setSelected,
  });
  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        setPage(1);
        clearSelection();
        setApplied(draft);
      },
      draft.search ? 180 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [draft, clearSelection]);

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
    closeDetail();
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
    return <p role="status">Verwaltung wird geladen …</p>;
  if (apiState === 'unauthorized')
    return (
      <section className="admin-state">
        <h2>Anmeldung erforderlich</h2>
        <p role="alert">Bitte erneut anmelden.</p>
      </section>
    );
  if (apiState === 'forbidden')
    return (
      <section className="admin-state">
        <h2>Zugriff verweigert</h2>
        <p role="alert">Dein Konto darf diese Veranstaltung nicht verwalten.</p>
      </section>
    );
  if (apiState === 'unavailable' && events.length === 0)
    return (
      <section className="admin-state">
        <h2>Verwaltung nicht verfügbar</h2>
        <p role="alert">Veranstaltungen konnten nicht geladen werden.</p>
      </section>
    );

  return (
    <section className="admin-entries" aria-labelledby="admin-entries-title">
      <h2
        id="admin-entries-title"
        className={onSharedEventChange ? 'nb-visually-hidden' : undefined}
      >
        Nennungen
      </h2>
      {!onSharedEventChange && (
        <SelectField
          label="Veranstaltung"
          aria-label="Veranstaltung"
          value={eventId}
          onChange={(e) => changeEvent(e.target.value)}
        >
          <option value="">Veranstaltung wählen</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </SelectField>
      )}
      {!isDetailOpen && (
        <AdminEntryList
          eventId={eventId}
          apiState={apiState}
          draft={draft}
          setDraft={setDraft}
          changeSort={changeSort}
          counts={counts}
          classes={classes}
          workflow={workflow}
          total={total}
          items={items}
          selected={selected}
          selectedIds={selectedIds}
          setSelection={setSelection}
          openEntry={openEntry}
          eligibleSelectedItems={eligibleSelectedItems}
          busy={busy}
          clearSelection={clearSelection}
          bulkAccept={bulkAccept}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
        />
      )}
      {isDetailOpen && selected && (
        <div className="admin-detail-view">
          <Button variant="secondary" onClick={closeDetail}>
            ← Zurück zur Liste
          </Button>
          <AdminEntryDetail
            selected={selected}
            classes={classes}
            workflow={workflow}
            reason={reason}
            setReason={setReason}
            busy={busy}
            transition={transition}
          />
        </div>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </section>
  );
}
