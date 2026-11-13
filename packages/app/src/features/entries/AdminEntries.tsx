import { useCallback, useEffect, useRef, useState } from 'react';
import { SelectField } from '@racepilot/ui';
import {
  applyEntrySort,
  initialQuery,
  request,
  type EntryQuery,
} from './AdminEntriesModel.js';
import { AdminEntriesState } from './AdminEntriesState.js';
import { AdminEntryDetail } from './AdminEntryDetail.js';
import { AdminEntryList } from './AdminEntryList.js';
import { useAdminEntryActions } from './useAdminEntryActions.js';
import { useAdminEntriesData } from './useAdminEntriesData.js';
import { useAdminEntriesKeyboard } from './useAdminEntriesKeyboard.js';
import { usePreviewAdvance } from './usePreviewAdvance.js';
import { useOpenEntryDetail } from './useOpenEntryDetail.js';
import { useEntryChangesRefresh } from './useEntryChangesRefresh.js';
import { useSharedSelection } from './useSharedSelection.js';
import type { AdminEntriesProps } from './AdminEntriesProps.js';
import { useEntrySearch } from './useEntrySearch.js';

/** Event changes reset view state and cancel requests scoped to the previous event. */

export function AdminEntries(props: AdminEntriesProps = {}) {
  return (
    <AdminEntriesView
      key={`${props.eventId ?? 'standalone'}:${props.filterRevision ?? 0}`}
      {...props}
    />
  );
}

function AdminEntriesView({
  detailOpen,
  preview,
  mobilePreviewOpen,
  autoPreview = false,
  onOpenDetail,
  onMessage,
  onCloseDetail,
  onSelectionChange,
  onWorkflowChange,
  entriesRevision = 0,
  previewAdvance = null,
  onPreviewAdvanceHandled,
  selectedEntry: sharedSelectedEntry,
  onTotalChange,
  eventId: sharedEventId,
  initialFilters = {},
  onEventChange: onSharedEventChange,
}: AdminEntriesProps) {
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
  const pageSize = 12;
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [draft, setDraft] = useState<EntryQuery>({
    ...initialQuery,
    ...initialFilters,
  });
  const [applied, setApplied] = useState<EntryQuery>({
    ...initialQuery,
    ...initialFilters,
  });
  const [selected, setSelected] = useSharedSelection(
    sharedSelectedEntry,
    onSelectionChange,
  );
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
  useEffect(() => onWorkflowChange?.(workflow), [onWorkflowChange, workflow]);
  const {
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
  const openEntryDetail = useOpenEntryDetail(selected, openEntry, openDetail);
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
  usePreviewAdvance({
    eventId,
    items,
    workflow,
    openEntry,
    setRefreshRevision,
    entriesRevision,
    previewAdvance,
    onPreviewAdvanceHandled,
  });
  useEntryChangesRefresh(setRefreshRevision);
  useAdminEntriesKeyboard({
    items,
    selected,
    isDetailOpen,
    openEntry,
    openDetail,
    closeDetail,
    setSelected,
  });
  useEntrySearch(draft, setApplied, setPage, clearSelection);

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
    applyEntrySort(
      nextSort,
      nextDirection,
      setDraft,
      setPage,
      clearSelection,
      setApplied,
    );
  }

  if (events.length === 0 && apiState !== 'ready')
    return <AdminEntriesState state={apiState} />;

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
      {!(isDetailOpen && selected) && (
        <AdminEntryList
          preview={preview}
          mobilePreviewOpen={mobilePreviewOpen}
          wide={autoPreview}
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
          openEntry={autoPreview ? openEntry : openEntryDetail}
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
        <AdminEntryDetail
          key={selected.id}
          selected={selected}
          classes={classes}
          workflow={workflow}
          busy={busy}
          error={actionError}
          transition={transition}
          onBack={closeDetail}
          onMessage={onMessage}
          onUpdated={(entry, refresh = true) => {
            setSelected(entry);
            if (refresh) setRefreshRevision((value) => value + 1);
          }}
        />
      )}
      {actionError && !(isDetailOpen && selected) && (
        <p role="alert">{actionError}</p>
      )}
    </section>
  );
}
