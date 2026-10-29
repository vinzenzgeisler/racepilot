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
  search: string;
  sort: string;
  direction: string;
};
const initialQuery: EntryQuery = {
  classId: '',
  acceptanceStatus: '',
  verificationStatus: '',
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

export function AdminEntries() {
  const [apiState, setApiState] = useState<ApiState>('loading');
  const [events, setEvents] = useState<Event[]>([]);
  const [eventId, setEventId] = useState('');
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

  async function openEntry(id: string) {
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
  }

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

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setApplied({ ...draft });
  }

  function changeEvent(nextEventId: string) {
    invalidateContextRequests();
    setEventId(nextEventId);
    setPage(1);
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
      <h2 id="admin-entries-title">Entries</h2>
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
              Search
              <input
                value={draft.search}
                maxLength={120}
                onChange={(e) =>
                  setDraft((value) => ({ ...value, search: e.target.value }))
                }
                placeholder="Name or entry ID"
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
                  <th>Entry</th>
                  <th>Class</th>
                  <th>Acceptance</th>
                  <th>Verification</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {apiState === 'ready' &&
                  items.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => void openEntry(entry.id)}
                        >
                          {entry.id}
                        </button>
                      </td>
                      <td>
                        {classes.find((item) => item.id === entry.classId)
                          ?.name ?? entry.classId}
                      </td>
                      <td>
                        <StatusBadge
                          status={workflow?.statuses.find(
                            (item) => item.key === entry.acceptanceStatus,
                          )}
                          fallback={entry.acceptanceStatus}
                        />
                      </td>
                      <td>{entry.verificationStatus}</td>
                      <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                {apiState === 'ready' && items.length === 0 && (
                  <tr>
                    <td colSpan={5}>No entries match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <nav className="admin-pagination" aria-label="Entry pages">
            <button
              type="button"
              disabled={page <= 1 || apiState === 'loading'}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {totalPages === 0 ? 0 : page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || apiState === 'loading'}
              onClick={() => setPage((value) => value + 1)}
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
            <dt>Driver record</dt>
            <dd>{selected.driverPersonId}</dd>
            <dt>Vehicle record</dt>
            <dd>{selected.vehicleId}</dd>
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
            <button
              type="button"
              disabled={
                busy ||
                !reason.trim() ||
                selected.verificationStatus === 'verified'
              }
              onClick={() => void transition('verification', 'verified')}
            >
              Mark verified
            </button>
          </div>
          <p className="admin-dependency">
            Invoice, payment history, consent evidence, audit timeline, notes
            and status-mail actions are not exposed by the current admin API.
          </p>
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
