import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { AdminWorkflow, defaultWorkflow } from './AdminWorkflow.js';
import {
  AdminEntryListResponse,
  EntryResponse,
  EventSchema,
  type EntryResponse as Entry,
} from '@racepilot/contracts';

type Event = ReturnType<typeof EventSchema.parse>;
type ApiState =
  'loading' | 'ready' | 'unauthorized' | 'forbidden' | 'unavailable';
type EntryQuery = {
  classId: string;
  acceptanceStatus: string;
  verificationStatus: string;
  paymentStatus: string;
  search: string;
  sort: string;
  direction: string;
};
const initialQuery: EntryQuery = {
  classId: '',
  acceptanceStatus: '',
  verificationStatus: '',
  paymentStatus: '',
  search: '',
  sort: 'createdAt',
  direction: 'desc',
};
type Gate = { generation: number; controller: AbortController | null };
type WorkflowStatus = {
  key: string;
  labels: { de: string; en: string };
  color: string;
  category: string;
};
type WorkflowView = {
  statuses: WorkflowStatus[];
  transitions: Array<{
    from: string;
    to: string;
    reasonRequired: boolean;
    permission?: string;
    roles?: Array<'admin' | 'member'> | undefined;
    notify?: boolean;
  }>;
};

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}
function messageFor(status: number): ApiState {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  return 'unavailable';
}
function invalidate(gate: Gate) {
  gate.generation += 1;
  gate.controller?.abort();
  gate.controller = null;
}
function begin(gate: Gate) {
  invalidate(gate);
  const controller = new AbortController();
  gate.controller = controller;
  return { generation: gate.generation, controller };
}
function isCurrent(
  gate: Gate,
  generation: number,
  controller: AbortController,
) {
  return gate.generation === generation && !controller.signal.aborted;
}

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
    fetch(
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
      {eventId && (
        <>
          <form className="admin-filters" onSubmit={applyFilters}>
            <label>
              Class
              <select
                value={draft.classId}
                onChange={(e) =>
                  setDraft((value) => ({ ...value, classId: e.target.value }))
                }
              >
                <option value="">All classes</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Acceptance
              <select
                value={draft.acceptanceStatus}
                onChange={(e) =>
                  setDraft((value) => ({
                    ...value,
                    acceptanceStatus: e.target.value,
                  }))
                }
              >
                <option value="">All</option>
                {(workflow?.statuses ?? []).map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.labels.en} ({status.key})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Verification
              <select
                value={draft.verificationStatus}
                onChange={(e) =>
                  setDraft((value) => ({
                    ...value,
                    verificationStatus: e.target.value,
                  }))
                }
              >
                <option value="">All</option>
                <option value="unverified">Unverified</option>
                <option value="verified">Verified</option>
              </select>
            </label>
            <label>
              Zahlung
              <select
                value={draft.paymentStatus}
                onChange={(e) =>
                  setDraft((value) => ({
                    ...value,
                    paymentStatus: e.target.value,
                  }))
                }
              >
                <option value="">Alle Zahlungen</option>
                <option value="open">Offen</option>
                <option value="partially_paid">Teilweise bezahlt</option>
                <option value="paid">Bezahlt</option>
                <option value="not_required">Nicht erforderlich</option>
                <option value="not_relevant">Nicht relevant</option>
              </select>
            </label>
            <label>
              Search
              <input
                value={draft.search}
                maxLength={120}
                onChange={(e) =>
                  setDraft((value) => ({ ...value, search: e.target.value }))
                }
                placeholder="Startnummer, Name oder Nennungs-ID"
              />
            </label>
            <label>
              Sort
              <select
                value={draft.sort}
                onChange={(e) => changeSort(e.target.value)}
              >
                <option value="createdAt">Created</option>
                <option value="requestedStartNumber">Start number</option>
                <option value="acceptanceStatus">Acceptance</option>
                <option value="verificationStatus">Verification</option>
              </select>
            </label>
            <label>
              Order
              <select
                value={draft.direction}
                onChange={(e) => changeSort(draft.sort, e.target.value)}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
            <button type="submit">Apply filters</button>
          </form>
          <p aria-live="polite">
            {apiState === 'loading' ? 'Loading entries…' : `${total} entries`}
          </p>
          {apiState === 'unavailable' && (
            <p role="alert">Entries could not be loaded.</p>
          )}
          <div className="admin-table-wrap">
            <table>
              <thead>
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
              </thead>
              <tbody>
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
                        <input
                          aria-label={`Nennung ${entry.adminDetails?.driver.name ?? entry.id} auswählen`}
                          type="checkbox"
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
                            {entry.adminDetails.driver.emailVerified
                              ? ' ✓'
                              : ''}
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
                            <small className="entry-hint" key={hint.key}>
                              {hint.key.replaceAll('_', ' ').toUpperCase()}
                            </small>
                          ))}
                      </td>
                      <td data-priority="2">
                        {entry.adminDetails?.eventClass.name ??
                          classes.find((item) => item.id === entry.classId)
                            ?.name ??
                          entry.classId}
                      </td>
                      <td data-priority="1">
                        <strong className="app-start-number">
                          {entry.adminDetails?.startNumber ?? '—'}
                        </strong>
                      </td>
                      <td data-priority="1">
                        <StatusBadge
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
                            [
                              'technical_inspection',
                              'waiver',
                              'payment',
                            ].includes(item.key),
                          )
                          .map((item) => `${item.label.de}: ${item.value}`)
                          .join(' · ')}
                      >
                        {entry.statusProjection?.dimensions
                          .filter((item) =>
                            ['technical_inspection', 'waiver'].includes(
                              item.key,
                            ),
                          )
                          .map((item) => `${item.label.de}: ${item.value}`)
                          .join(' · ') || '—'}
                      </td>
                      <td
                        data-priority="1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="entry-row-actions">
                          <button
                            type="button"
                            data-selected-entry={
                              selected?.id === entry.id ? true : undefined
                            }
                            data-entry-action={entry.id}
                            onClick={() => void openEntry(entry.id)}
                          >
                            {entry.statusProjection?.dimensions.find(
                              (item) => item.nextAction,
                            )?.nextAction?.label.de ?? 'Öffnen'}
                          </button>
                        </div>
                      </td>
                      <td data-priority="4">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                {apiState === 'ready' && items.length === 0 && (
                  <tr>
                    <td colSpan={9}>Keine Nennungen für diese Filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {selectedIds.size > 0 && (
            <div
              className="entry-selection-bar"
              role="toolbar"
              aria-label="Massenaktionen"
            >
              <strong>
                {selectedIds.size} von {total} ausgewählt
              </strong>
              <button type="button" onClick={() => clearSelection()}>
                Auswahl aufheben
              </button>
              <button
                type="button"
                disabled={busy || eligibleSelectedItems.length === 0}
                onClick={() => void bulkAccept()}
              >
                Zulassen ({eligibleSelectedItems.length} von {selectedIds.size})
              </button>
            </div>
          )}
          <nav className="admin-pagination" aria-label="Entry pages">
            <button
              type="button"
              disabled={page <= 1 || apiState === 'loading'}
              onClick={() => {
                clearSelection();
                setPage((value) => value - 1);
              }}
            >
              Previous
            </button>
            <span>
              Page {totalPages === 0 ? 0 : page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || apiState === 'loading'}
              onClick={() => {
                clearSelection();
                setPage((value) => value + 1);
              }}
            >
              Next
            </button>
          </nav>
        </>
      )}
      {selected && (
        <section className="admin-detail" aria-labelledby="entry-detail-title">
          <h3 id="entry-detail-title">Entry detail</h3>
          <dl>
            <dt>Entry ID</dt>
            <dd>{selected.id}</dd>
            <dt>Class</dt>
            <dd>
              {classes.find((item) => item.id === selected.classId)?.name ??
                selected.classId}
            </dd>
            <dt>Registration group</dt>
            <dd>{selected.registrationGroupId}</dd>
            <dt>Fahrer</dt>
            <dd>
              {selected.adminDetails?.driver.name ?? selected.driverPersonId}
            </dd>
            <dt>Geburtsdatum</dt>
            <dd>{selected.adminDetails?.driver.dateOfBirth ?? '—'}</dd>
            <dt>Land</dt>
            <dd>{selected.adminDetails?.driver.country ?? '—'}</dd>
            <dt>E-Mail</dt>
            <dd>
              {selected.adminDetails?.driver.email ?? '—'}{' '}
              {selected.adminDetails?.driver.emailVerified ? '✓' : ''}
            </dd>
            <dt>Fahrzeug</dt>
            <dd>
              {selected.adminDetails
                ? `${selected.adminDetails.vehicle.make} ${selected.adminDetails.vehicle.model}${selected.adminDetails.vehicle.year ? ` · ${selected.adminDetails.vehicle.year}` : ''}`
                : selected.vehicleId}
            </dd>
            <dt>Startnummer</dt>
            <dd>{selected.adminDetails?.startNumber ?? '—'}</dd>
            <dt>Acceptance</dt>
            <dd>
              <StatusBadge
                status={workflow?.statuses.find(
                  (item) => item.key === selected.acceptanceStatus,
                )}
                fallback={selected.acceptanceStatus}
              />
            </dd>
            <dt>Verification</dt>
            <dd>{selected.verificationStatus}</dd>
            <dt>Price snapshot total</dt>
            <dd>
              {selected.priceSnapshot
                ? new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: selected.priceSnapshot.currency,
                  }).format(selected.priceSnapshot.totalCents / 100)
                : 'Not available'}
            </dd>
          </dl>
          <label>
            Reason (required for audit)
            <textarea
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="admin-actions">
            {(workflow?.transitions ?? [])
              .filter((edge) => edge.from === selected.acceptanceStatus)
              .map((edge) => {
                const status = workflow?.statuses.find(
                  (item) => item.key === edge.to,
                );
                return (
                  <button
                    key={edge.to}
                    type="button"
                    disabled={busy || !reason.trim()}
                    onClick={() => void transition('acceptance', edge.to)}
                  >
                    <StatusBadge status={status} fallback={edge.to} />
                  </button>
                );
              })}
            {selected.verificationStatus !== 'verified' && (
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => void transition('verification', 'verified')}
              >
                Mark verified
              </button>
            )}
          </div>
          <section className="admin-documents" aria-label="Prüfstatus">
            <h4>Prüfstatus</h4>
            <p>
              Echte Nennungsunterlagen und Upload-Zähler sind noch nicht
              verfügbar.
            </p>
            <ul>
              {selected.statusProjection?.dimensions
                .filter((item) =>
                  ['technical_inspection', 'waiver'].includes(item.key),
                )
                .map((item) => (
                  <li key={item.key}>
                    <span>{item.label.de}</span>
                    <strong>{item.value}</strong>
                  </li>
                ))}
            </ul>
          </section>
          <section aria-label="Verlauf">
            <h4>Verlauf</h4>
            <ol>
              {(selected.adminHistory ?? []).map((event) => (
                <li key={`${event.kind}-${event.id}`}>
                  <time dateTime={event.occurredAt}>
                    {new Date(event.occurredAt).toLocaleString()}
                  </time>{' '}
                  · {event.label} · {event.actor}
                  {event.detail ? ` — ${event.detail}` : ''}
                </li>
              ))}
            </ol>
          </section>
        </section>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </section>
  );
}

function StatusBadge({
  status,
  fallback,
}: {
  status: WorkflowStatus | undefined;
  fallback: string;
}) {
  const locale = navigator.language.toLowerCase().startsWith('de')
    ? 'de'
    : 'en';
  return (
    <span
      className="entry-status"
      style={
        status ? { color: status.color, borderColor: status.color } : undefined
      }
      title={fallback}
    >
      {status ? `${status.labels[locale]} · ${status.key}` : fallback}
    </span>
  );
}
