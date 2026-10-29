import { useEffect, useState } from 'react';
import { EventSchema } from '@racepilot/contracts';

type Event = ReturnType<typeof EventSchema.parse>;
type Status = {
  key: string;
  labels: { de: string; en: string };
  color: string;
  category: string;
};
type Workflow = {
  version: number;
  statuses: Status[];
  transitions: Array<{ from: string; to: string; reasonRequired: boolean }>;
};
type Revision = { id: string; version: number; workflow: Workflow };

export function AdminWorkflow({
  eventId,
  events,
}: {
  eventId: string;
  events: Event[];
}) {
  const [revision, setRevision] = useState<Revision | null>(null);
  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!eventId) return;
    const abort = new AbortController();
    fetch(
      `/admin/events/${encodeURIComponent(eventId)}/registration-workflow`,
      { credentials: 'same-origin', cache: 'no-store', signal: abort.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? 'You do not have permission to read this event workflow.'
              : 'Workflow could not be loaded.',
          );
        return response.json() as Promise<Revision>;
      })
      .then((value) => {
        setRevision(value);
        setDraft(JSON.stringify(value.workflow, null, 2));
        setMessage('');
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setMessage(error.message);
      })
      .finally(() => setLoading(false));
    return () => abort.abort();
  }, [eventId]);
  async function save() {
    let workflow: Workflow;
    try {
      workflow = JSON.parse(draft) as Workflow;
    } catch {
      setMessage('Workflow JSON is invalid.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/admin/events/${encodeURIComponent(eventId)}/registration-workflow`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workflow, reason }),
        },
      );
      const result = (await response.json()) as Revision & {
        details?: string[];
      };
      if (!response.ok)
        throw new Error(
          result.details?.join(' · ') ??
            (response.status === 403
              ? 'You do not have permission to activate this workflow.'
              : 'Workflow validation or activation failed.'),
        );
      setRevision(result);
      setDraft(JSON.stringify(result.workflow, null, 2));
      setReason('');
      setMessage(`Workflow revision ${result.version} activated.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Workflow could not be activated.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="admin-workflow">
      <summary>Event status workflow</summary>
      {!eventId ? (
        <p>Select an event to edit its workflow.</p>
      ) : loading ? (
        <p role="status">Loading workflow…</p>
      ) : (
        <>
          <p>
            {events.find((event) => event.id === eventId)?.name} · active
            revision {revision?.version ?? 'unavailable'}
          </p>
          <label>
            Status keys, labels, colors and allowed transitions (JSON)
            <textarea
              aria-label="Workflow configuration"
              rows={18}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label>
            Activation reason (required)
            <input
              aria-label="Workflow activation reason"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !reason.trim() || !eventId}
            onClick={() => void save()}
          >
            Validate and activate
          </button>
          <p role="status" aria-live="polite">
            {message}
          </p>
          {revision && (
            <ul aria-label="Active event statuses">
              {revision.workflow.statuses.map((status) => (
                <li key={status.key}>
                  <span style={{ color: status.color }}>●</span> {status.key}:{' '}
                  {status.labels.en} / {status.labels.de}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </details>
  );
}

export const defaultWorkflow: Workflow = {
  version: 1,
  statuses: [
    {
      key: 'pending',
      labels: { de: 'Ausstehend', en: 'Pending' },
      color: '#64748b',
      category: 'pending',
    },
    {
      key: 'accepted',
      labels: { de: 'Angenommen', en: 'Accepted' },
      color: '#15803d',
      category: 'accepted',
    },
    {
      key: 'rejected',
      labels: { de: 'Abgelehnt', en: 'Rejected' },
      color: '#b91c1c',
      category: 'rejected',
    },
    {
      key: 'waitlisted',
      labels: { de: 'Warteliste', en: 'Waitlisted' },
      color: '#a16207',
      category: 'waitlisted',
    },
    {
      key: 'withdrawn',
      labels: { de: 'Zurückgezogen', en: 'Withdrawn' },
      color: '#475569',
      category: 'withdrawn',
    },
  ],
  transitions: [
    ...['accepted', 'rejected', 'waitlisted', 'withdrawn'].map((to) => ({
      from: 'pending',
      to,
      reasonRequired: false,
    })),
    ...['accepted', 'rejected', 'waitlisted'].map((from) => ({
      from,
      to: 'withdrawn',
      reasonRequired: false,
    })),
    { from: 'waitlisted', to: 'accepted', reasonRequired: false },
    { from: 'waitlisted', to: 'rejected', reasonRequired: false },
  ],
};
