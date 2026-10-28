import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AdminEntryListResponse,
  EntryResponse,
  EventSchema,
  type EntryResponse as Entry,
} from '@racepilot/contracts';

type Event = ReturnType<typeof EventSchema.parse>;
type ApiState =
  'loading' | 'ready' | 'unauthorized' | 'forbidden' | 'unavailable';

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

export function AdminEntries() {
  const [apiState, setApiState] = useState<ApiState>('loading');
  const [events, setEvents] = useState<Event[]>([]);
  const [eventId, setEventId] = useState('');
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [acceptanceStatus, setAcceptanceStatus] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [direction, setDirection] = useState('desc');
  const [selected, setSelected] = useState<Entry | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    request('/admin/events')
      .then(async (response) => {
        if (!response.ok)
          throw Object.assign(new Error(), { status: response.status });
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error('Invalid event response');
        const parsed = payload.map((item) => EventSchema.parse(item));
        if (!active) return;
        setEvents(parsed);
        setApiState('ready');
      })
      .catch((error: { status?: number }) => {
        if (active)
          setApiState(error.status ? messageFor(error.status) : 'unavailable');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!eventId) {
      return () => {
        active = false;
      };
    }
    request(`/admin/events/${encodeURIComponent(eventId)}/classes`)
      .then(async (response) => {
        if (!response.ok)
          throw Object.assign(new Error(), { status: response.status });
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error('Invalid class response');
        if (active)
          setClasses(
            payload.map((value) => ({ id: value.id, name: value.name })),
          );
      })
      .catch((error: { status?: number }) => {
        if (active)
          setActionError(
            error.status === 403
              ? 'You do not have permission to view event classes.'
              : 'Event classes are unavailable.',
          );
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  const loadEntries = useCallback(async () => {
    if (!eventId) return;
    setApiState('loading');
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      eventId,
      sort,
      direction,
    });
    if (classId) params.set('classId', classId);
    if (acceptanceStatus) params.set('acceptanceStatus', acceptanceStatus);
    if (verificationStatus)
      params.set('verificationStatus', verificationStatus);
    if (search.trim()) params.set('search', search.trim());
    try {
      const response = await request(`/admin/entries?${params}`);
      if (!response.ok) {
        setApiState(messageFor(response.status));
        return;
      }
      const result = AdminEntryListResponse.parse(await response.json());
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setApiState('ready');
    } catch {
      setApiState('unavailable');
    }
  }, [
    eventId,
    page,
    pageSize,
    classId,
    acceptanceStatus,
    verificationStatus,
    search,
    sort,
    direction,
  ]);

  useEffect(() => {
    // This effect intentionally synchronizes the selected query with the remote list API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEntries();
  }, [loadEntries]);

  async function openEntry(id: string) {
    setSelected(null);
    setActionError('');
    try {
      const response = await request(
        `/admin/entries/${encodeURIComponent(id)}`,
      );
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
      setSelected(EntryResponse.parse(await response.json()));
    } catch {
      setActionError('Entry details are unavailable.');
    }
  }

  async function transition(
    transitionType: 'acceptance' | 'verification',
    status: string,
  ) {
    if (!selected || !reason.trim()) return;
    setBusy(true);
    setActionError('');
    try {
      const response = await request(
        `/admin/entries/${encodeURIComponent(selected.id)}/transitions`,
        {
          method: 'POST',
          body: JSON.stringify({
            transition: transitionType,
            status,
            reason: reason.trim(),
          }),
        },
      );
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
      setSelected(EntryResponse.parse(await response.json()));
      setReason('');
      await loadEntries();
    } catch {
      setActionError('The status change could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  function applySearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
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
          onChange={(e) => {
            setEventId(e.target.value);
            setPage(1);
            setClasses([]);
            setItems([]);
            setSelected(null);
          }}
        >
          <option value="">Select an event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </label>
      {eventId && (
        <>
          <form className="admin-filters" onSubmit={applySearch}>
            <label>
              Class
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setPage(1);
                }}
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
                value={acceptanceStatus}
                onChange={(e) => {
                  setAcceptanceStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {[
                  'pending',
                  'accepted',
                  'rejected',
                  'waitlisted',
                  'withdrawn',
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Verification
              <select
                value={verificationStatus}
                onChange={(e) => {
                  setVerificationStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="unverified">Unverified</option>
                <option value="verified">Verified</option>
              </select>
            </label>
            <label>
              Search
              <input
                value={search}
                maxLength={120}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or entry ID"
              />
            </label>
            <label>
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="createdAt">Created</option>
                <option value="requestedStartNumber">Start number</option>
                <option value="acceptanceStatus">Acceptance</option>
                <option value="verificationStatus">Verification</option>
              </select>
            </label>
            <label>
              Order
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
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
                      <td>{entry.acceptanceStatus}</td>
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
            <dd>{selected.acceptanceStatus}</dd>
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
            {(['accepted', 'rejected', 'waitlisted', 'withdrawn'] as const).map(
              (status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() => void transition('acceptance', status)}
                >
                  {status}
                </button>
              ),
            )}
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
