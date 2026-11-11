import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { SelectField } from '@racepilot/ui';
import {
  initialQuery,
  request,
  type EntryQuery,
  type WorkflowView,
} from './AdminEntriesModel.js';
import { AdminEntriesState } from './AdminEntriesState.js';
import { AdminEntryDetail } from './AdminEntryDetail.js';
import { AdminEntryList } from './AdminEntryList.js';
import { useAdminEntryActions } from './useAdminEntryActions.js';
import { useAdminEntriesData } from './useAdminEntriesData.js';
import { useAdminEntriesKeyboard } from './useAdminEntriesKeyboard.js';
import { usePreviewAdvance } from './usePreviewAdvance.js';
import { useOpenEntryDetail } from './useOpenEntryDetail.js';
import { useSharedSelection } from './useSharedSelection.js';
type AdminEntriesProps = {
  detailOpen?: boolean;
  preview?: ReactNode;
  mobilePreviewOpen?: boolean | undefined;
  autoPreview?: boolean;
  onOpenDetail?: () => void;
  onCloseDetail?: () => void;
  onSelectionChange?: (entry: Entry | null) => void;
  onWorkflowChange?: (workflow: WorkflowView | null) => void;
  entriesRevision?: number;
  previewAdvance?: { eventId: string; entryId: string } | null | undefined;
  onPreviewAdvanceHandled?: () => void;
  selectedEntry?: Entry | null;
  onTotalChange?: (total: number) => void;
  eventId?: string;
  onEventChange?: (id: string) => void;
};

/**
 * Everything the view holds belongs to one event: selection, filters, page, open detail,
 * requests in flight. A different shared event therefore mounts a fresh view, which aborts
 * the old requests and cannot show or update the previous event's entries.
 */
export function AdminEntries(props: AdminEntriesProps = {}) {
  return <AdminEntriesView key={props.eventId ?? 'standalone'} {...props} />;
}

function AdminEntriesView({
  detailOpen,
  preview,
  mobilePreviewOpen,
  autoPreview = false,
  onOpenDetail,
  onCloseDetail,
  onSelectionChange,
  onWorkflowChange,
  entriesRevision = 0,
  previewAdvance = null,
  onPreviewAdvanceHandled,
  selectedEntry: sharedSelectedEntry,
  onTotalChange,
  eventId: sharedEventId,
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
  const [draft, setDraft] = useState<EntryQuery>(initialQuery);
  const [applied, setApplied] = useState<EntryQuery>(initialQuery);
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
          workflow={workflow}
          busy={busy}
          error={actionError}
          transition={transition}
          onBack={closeDetail}
          onUpdated={(entry) => {
            setSelected(entry);
            setRefreshRevision((value) => value + 1);
          }}
        />
      )}
      {actionError && !(isDetailOpen && selected) && (
        <p role="alert">{actionError}</p>
      )}
    </section>
  );
}
