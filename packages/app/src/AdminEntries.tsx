import { adminFetch } from './auth.js';
import {
  begin,
  invalidate,
  isCurrent,
  messageFor,
  request,
  initialQuery,
  type ApiState,
  type EntryQuery,
  type Event,
  type Gate,
  type WorkflowView,
} from './AdminEntriesModel.js';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { AdminWorkflow, defaultWorkflow } from './AdminWorkflow.js';
import { AdminEntryDetail } from './AdminEntryDetail.js';
import { AdminEntryList } from './AdminEntryList.js';
import {
  AdminEntryListResponse,
  EntryResponse,
  EventSchema,
  type EntryResponse as Entry,
} from '@racepilot/contracts';

export function AdminEntries({
  onSelectionChange,
  eventId: sharedEventId,
  onEventChange: onSharedEventChange,
}: {
  onSelectionChange?: (entry: Entry | null) => void;
  eventId?: string;
  onEventChange?: (id: string) => void;
} = {}) {
  const [apiState, setApiState] = useState<ApiState>('loading');
  const [events, setEvents] = useState<Event[]>([]);
  const [localEventId, setLocalEventId] = useState('');
  const eventId = sharedEventId ?? localEventId;
  const [workflow, setWorkflow] = useState<WorkflowView | null>(null);
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [draft, setDraft] = useState<EntryQuery>(initialQuery);
  const [applied, setApplied] = useState<EntryQuery>(initialQuery);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [selected, setSelected] = useState<Entry | null>(null);
  const [selection, setSelection] = useState<{
    eventId: string;
    ids: Set<string>;
  }>({ eventId, ids: new Set() });
  const selectedIds =
    selection.eventId === eventId ? selection.ids : new Set<string>();
  const clearSelection = () => setSelection({ eventId, ids: new Set() });
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
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const listGate = useRef<Gate>({ generation: 0, controller: null });
  const detailGate = useRef<Gate>({ generation: 0, controller: null });
  const transitionGate = useRef<Gate>({ generation: 0, controller: null });
  const classGate = useRef<Gate>({ generation: 0, controller: null });

  const invalidateContextRequests = useCallback(() => {
    invalidate(listGate.current);
    invalidate(detailGate.current);
    invalidate(transitionGate.current);
    invalidate(classGate.current);
  }, []);

  useEffect(() => {
    let active = true;
    const gate = classGate.current;
    const { generation, controller } = begin(gate);
    request('/admin/events', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw Object.assign(new Error(), { status: response.status });
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error('Invalid event response');
        const parsed = payload.map((item) => EventSchema.parse(item));
        if (!active || !isCurrent(gate, generation, controller)) return;
        setEvents(parsed);
        setApiState('ready');
      })
      .catch((error: { status?: number }) => {
        if (active && isCurrent(gate, generation, controller))
          setApiState(error.status ? messageFor(error.status) : 'unavailable');
      });
    return () => {
      active = false;
      controller.abort();
      if (gate.controller === controller) gate.controller = null;
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    adminFetch(
      `/admin/events/${encodeURIComponent(eventId)}/registration-workflow`,
      {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      },
    )
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ workflow: WorkflowView }>)
          : null,
      )
      .then((value) => {
        if (!controller.signal.aborted)
          setWorkflow(value?.workflow ?? defaultWorkflow);
      })
      .catch(() => {
        if (!controller.signal.aborted) setWorkflow(defaultWorkflow);
      });
    return () => controller.abort();
  }, [eventId, refreshRevision]);

  useEffect(() => {
    if (!eventId) return;
    const gate = classGate.current;
    const { generation, controller } = begin(gate);
    request(`/admin/events/${encodeURIComponent(eventId)}/classes`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw Object.assign(new Error(), { status: response.status });
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error('Invalid class response');
        if (!isCurrent(gate, generation, controller)) return;
        setClasses(
          payload.map((value) => ({ id: value.id, name: value.name })),
        );
      })
      .catch((error: { status?: number }) => {
        if (!isCurrent(gate, generation, controller)) return;
        setActionError(
          error.status === 403
            ? 'You do not have permission to view event classes.'
            : 'Event classes are unavailable.',
        );
      });
    return () => {
      controller.abort();
      if (gate.controller === controller) gate.controller = null;
    };
  }, [eventId]);

  const loadEntries = useCallback(async () => {
    if (!eventId) return;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      eventId,
      sort: applied.sort,
      direction: applied.direction,
    });
    if (applied.classId) params.set('classId', applied.classId);
    if (applied.acceptanceStatus)
      params.set('acceptanceStatus', applied.acceptanceStatus);
    if (applied.verificationStatus)
      params.set('verificationStatus', applied.verificationStatus);
    if (applied.paymentStatus)
      params.set('paymentStatus', applied.paymentStatus);
    if (applied.search.trim()) params.set('search', applied.search.trim());

    const requestedEventId = eventId;
    const { generation, controller } = begin(listGate.current);
    setApiState('loading');
    try {
      const response = await request(`/admin/entries?${params}`, {
        signal: controller.signal,
      });
      if (!isCurrent(listGate.current, generation, controller)) return;
      if (!response.ok) {
        setApiState(messageFor(response.status));
        return;
      }
      const result = AdminEntryListResponse.parse(await response.json());
      if (
        !isCurrent(listGate.current, generation, controller) ||
        requestedEventId !== eventId
      )
        return;
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setApiState('ready');
    } catch {
      if (isCurrent(listGate.current, generation, controller))
        setApiState('unavailable');
    } finally {
      if (listGate.current.controller === controller)
        listGate.current.controller = null;
    }
  }, [eventId, page, pageSize, applied]);

  useEffect(() => {
    const gate = listGate.current;
    // This effect intentionally synchronizes the selected query with the remote list API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEntries();
    return () => invalidate(gate);
  }, [loadEntries, refreshRevision]);

  useEffect(
    () => () => invalidateContextRequests(),
    [invalidateContextRequests],
  );

  const openEntry = useCallback(
    async (id: string) => {
      invalidate(transitionGate.current);
      setBusy(false);
      const requestedEventId = eventId;
      const { generation, controller } = begin(detailGate.current);
      setSelected(null);
      setReason('');
      setActionError('');
      try {
        const response = await request(
          `/admin/entries/${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );
        if (!isCurrent(detailGate.current, generation, controller)) return;
        if (!response.ok) {
          setActionError(
            response.status === 401
              ? 'Your OIDC session is not authorized. Sign in through the configured OIDC session.'
              : response.status === 403
                ? 'You do not have permission to view this entry.'
                : 'Entry details are unavailable.',
          );
          return;
        }
        const entry = EntryResponse.parse(await response.json());
        if (
          isCurrent(detailGate.current, generation, controller) &&
          eventId === requestedEventId &&
          entry.eventId === requestedEventId
        )
          setSelected(entry);
      } catch {
        if (isCurrent(detailGate.current, generation, controller))
          setActionError('Entry details are unavailable.');
      } finally {
        if (detailGate.current.controller === controller)
          detailGate.current.controller = null;
      }
    },
    [eventId],
  );

  async function transition(
    transitionType: 'acceptance' | 'verification',
    status: string,
  ) {
    const current = selected;
    if (!current || !reason.trim()) return;
    const requestedEventId = eventId;
    const requestedReason = reason.trim();
    const { generation, controller } = begin(transitionGate.current);
    setBusy(true);
    setActionError('');
    try {
      const response = await request(
        `/admin/entries/${encodeURIComponent(current.id)}/transitions`,
        {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            transition: transitionType,
            status,
            reason: requestedReason,
          }),
        },
      );
      if (!isCurrent(transitionGate.current, generation, controller)) return;
      if (!response.ok) {
        setActionError(
          response.status === 401
            ? 'Your OIDC session is not authorized.'
            : response.status === 403
              ? 'You do not have permission to change this entry.'
              : 'The status change was rejected.',
        );
        return;
      }
      const updated = EntryResponse.parse(await response.json());
      if (
        !isCurrent(transitionGate.current, generation, controller) ||
        eventId !== requestedEventId ||
        selected?.id !== current.id ||
        updated.id !== current.id ||
        updated.eventId !== requestedEventId
      )
        return;
      setSelected(updated);
      setReason('');
      setRefreshRevision((revision) => revision + 1);
      const acceptedCategory = workflow?.statuses.find(
        (item) => item.key === status && item.category === 'accepted',
      );
      if (transitionType === 'acceptance' && acceptedCategory) {
        const currentIndex = items.findIndex((item) => item.id === current.id);
        const nextOpen = items
          .slice(Math.max(0, currentIndex + 1))
          .find(
            (item) =>
              workflow?.statuses.find(
                (candidate) => candidate.key === item.acceptanceStatus,
              )?.category === 'pending' &&
              workflow.transitions.some(
                (edge) =>
                  edge.from === item.acceptanceStatus &&
                  edge.to === acceptedCategory.key,
              ),
          );
        if (nextOpen) void openEntry(nextOpen.id);
      }
    } catch {
      if (isCurrent(transitionGate.current, generation, controller))
        setActionError('The status change could not be completed.');
    } finally {
      if (
        isCurrent(transitionGate.current, generation, controller) &&
        selected?.id === current.id &&
        eventId === requestedEventId
      )
        setBusy(false);
      if (transitionGate.current.controller === controller)
        transitionGate.current.controller = null;
    }
  }

  const acceptedStatusKey = workflow?.statuses.find(
    (status) => status.category === 'accepted',
  )?.key;
  const eligibleSelectedItems = items.filter(
    (item) =>
      selectedIds.has(item.id) &&
      acceptedStatusKey !== undefined &&
      (workflow?.transitions ?? []).some(
        (edge) =>
          edge.from === item.acceptanceStatus && edge.to === acceptedStatusKey,
      ),
  );

  async function bulkAccept() {
    const eligible = eligibleSelectedItems;
    if (!eligible.length) return;
    const requestedReason = window
      .prompt(
        `Zulassen für ${eligible.length} von ${selectedIds.size} Nennungen. Grund für den Audit-Verlauf:`,
      )
      ?.trim();
    if (!requestedReason) return;
    setBusy(true);
    setActionError('');
    try {
      const responses = await Promise.all(
        eligible.map((item) =>
          request(`/admin/entries/${encodeURIComponent(item.id)}/transitions`, {
            method: 'POST',
            body: JSON.stringify({
              transition: 'acceptance',
              status: acceptedStatusKey,
              reason: requestedReason,
            }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok))
        throw new Error('bulk transition rejected');
      clearSelection();
      setRefreshRevision((revision) => revision + 1);
    } catch {
      setActionError(
        'Ein Teil der Massenaktion konnte nicht abgeschlossen werden. Bitte Liste aktualisieren und prüfen.',
      );
      setRefreshRevision((revision) => revision + 1);
    } finally {
      setBusy(false);
    }
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    clearSelection();
    setApplied({ ...draft });
  }

  function changeEvent(nextEventId: string) {
    invalidateContextRequests();
    if (onSharedEventChange) onSharedEventChange(nextEventId);
    else setLocalEventId(nextEventId);
    setPage(1);
    clearSelection();
    setDraft({ ...initialQuery });
    setApplied({ ...initialQuery });
    setClasses([]);
    setItems([]);
    setTotal(0);
    setTotalPages(0);
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
