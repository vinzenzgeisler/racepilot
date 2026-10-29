import { useEffect, useState } from 'react';
import { EventSchema } from '@racepilot/contracts';

type Event = ReturnType<typeof EventSchema.parse>;
type Status = {
  key: string;
  labels: { de: string; en: string };
  color: string;
  category: string;
};
type Transition = {
  from: string;
  to: string;
  reasonRequired: boolean;
  permission?: string;
  roles?: Array<'admin' | 'member'> | undefined;
  notify?: boolean;
};
type Workflow = {
  version: number;
  statuses: Status[];
  transitions: Transition[];
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
  const workflow = (() => {
    try {
      return JSON.parse(draft) as Workflow;
    } catch {
      return null;
    }
  })();
  function updateWorkflow(next: Workflow) {
    setDraft(JSON.stringify(next, null, 2));
  }
  function updateStatus(index: number, patch: Partial<Status>) {
    if (!workflow) return;
    const previousKey = workflow.statuses[index]?.key;
    const statuses = workflow.statuses.map((status, i) =>
      i === index ? { ...status, ...patch } : status,
    );
    const transitions =
      patch.key && previousKey
        ? workflow.transitions.map((edge) => ({
            ...edge,
            from: edge.from === previousKey ? patch.key! : edge.from,
            to: edge.to === previousKey ? patch.key! : edge.to,
          }))
        : workflow.transitions;
    updateWorkflow({ ...workflow, statuses, transitions });
  }
  function updateTransition(index: number, patch: Partial<Transition>) {
    if (!workflow) return;
    const transitions = workflow.transitions.map((edge, i) => {
      if (i !== index) return edge;
      const next = { ...edge, ...patch };
      if (patch.permission === '') delete next.permission;
      if (patch.roles?.length === 0) delete next.roles;
      return next;
    });
    updateWorkflow({ ...workflow, transitions });
  }
  return (
    <details className="admin-workflow">
      <summary>Event status workflow</summary>
      {!eventId ? (
        <p>Select an event to edit its workflow.</p>
      ) : loading ? (
        <p role="status">Loading workflow…</p>
      ) : !workflow ? (
        <p role="alert">Workflow draft is invalid.</p>
      ) : (
        <>
          <p>
            {events.find((event) => event.id === eventId)?.name} · active
            revision {revision?.version ?? 'unavailable'}
          </p>
          <section aria-label="Workflow statuses">
            <h3>Statuses</h3>
            {workflow.statuses.map((status, index) => (
              <fieldset key={`${index}-${status.key}`}>
                <legend>Status {index + 1}</legend>
                <label>
                  Status key
                  <input
                    aria-label={`Status ${index + 1} key`}
                    value={status.key}
                    onChange={(e) =>
                      updateStatus(index, { key: e.target.value })
                    }
                  />
                </label>
                <label>
                  English label
                  <input
                    aria-label={`Status ${index + 1} English label`}
                    value={status.labels.en}
                    onChange={(e) =>
                      updateStatus(index, {
                        labels: { ...status.labels, en: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  German label
                  <input
                    aria-label={`Status ${index + 1} German label`}
                    value={status.labels.de}
                    onChange={(e) =>
                      updateStatus(index, {
                        labels: { ...status.labels, de: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Color
                  <input
                    aria-label={`Status ${index + 1} color`}
                    type="color"
                    value={
                      /^#[0-9a-f]{6}$/i.test(status.color)
                        ? status.color
                        : '#000000'
                    }
                    onChange={(e) =>
                      updateStatus(index, { color: e.target.value })
                    }
                  />
                </label>
                <label>
                  Category
                  <select
                    aria-label={`Status ${index + 1} category`}
                    value={status.category}
                    onChange={(e) =>
                      updateStatus(index, { category: e.target.value })
                    }
                  >
                    {[
                      'pending',
                      'accepted',
                      'rejected',
                      'waitlisted',
                      'withdrawn',
                    ].map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateWorkflow({
                      ...workflow,
                      statuses: workflow.statuses.filter((_, i) => i !== index),
                      transitions: workflow.transitions.filter(
                        (edge) =>
                          edge.from !== status.key && edge.to !== status.key,
                      ),
                    })
                  }
                >
                  Remove status
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                updateWorkflow({
                  ...workflow,
                  statuses: [
                    ...workflow.statuses,
                    {
                      key: `status_${workflow.statuses.length + 1}`,
                      labels: { en: 'New status', de: 'Neuer Status' },
                      color: '#64748b',
                      category: 'pending',
                    },
                  ],
                })
              }
            >
              Add status
            </button>
          </section>
          <section aria-label="Workflow transitions">
            <h3>Allowed transitions</h3>
            {workflow.transitions.map((edge, index) => (
              <fieldset key={`${index}-${edge.from}-${edge.to}`}>
                <legend>Transition {index + 1}</legend>
                <label>
                  From
                  <select
                    aria-label={`Transition ${index + 1} from`}
                    value={edge.from}
                    onChange={(e) =>
                      updateTransition(index, { from: e.target.value })
                    }
                  >
                    {workflow.statuses.map((status) => (
                      <option key={status.key} value={status.key}>
                        {status.labels.en} ({status.key})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <select
                    aria-label={`Transition ${index + 1} to`}
                    value={edge.to}
                    onChange={(e) =>
                      updateTransition(index, { to: e.target.value })
                    }
                  >
                    {workflow.statuses.map((status) => (
                      <option key={status.key} value={status.key}>
                        {status.labels.en} ({status.key})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Transition ${index + 1} requires reason`}
                    checked={edge.reasonRequired}
                    onChange={(e) =>
                      updateTransition(index, {
                        reasonRequired: e.target.checked,
                      })
                    }
                  />{' '}
                  Reason required
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Transition ${index + 1} notify driver`}
                    checked={edge.notify ?? false}
                    onChange={(e) =>
                      updateTransition(index, { notify: e.target.checked })
                    }
                  />{' '}
                  Notify entrant by email
                </label>
                <fieldset>
                  <legend>
                    Allowed membership roles (empty uses entry:write permission)
                  </legend>
                  {(['admin', 'member'] as const).map((role) => (
                    <label key={role}>
                      <input
                        type="checkbox"
                        aria-label={`Transition ${index + 1} role ${role}`}
                        checked={edge.roles?.includes(role) ?? false}
                        onChange={(e) => {
                          const roles = new Set(edge.roles ?? []);
                          if (e.target.checked) roles.add(role);
                          else roles.delete(role);
                          updateTransition(index, {
                            roles: roles.size ? [...roles] : undefined,
                          });
                        }}
                      />{' '}
                      {role}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Required permission (optional)
                  <input
                    aria-label={`Transition ${index + 1} permission`}
                    value={edge.permission ?? ''}
                    onChange={(e) =>
                      updateTransition(index, {
                        permission: e.target.value,
                      })
                    }
                    placeholder="entry:write"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateWorkflow({
                      ...workflow,
                      transitions: workflow.transitions.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  Remove transition
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() => {
                const first = workflow.statuses[0]?.key;
                const second = workflow.statuses[1]?.key;
                if (first && second)
                  updateWorkflow({
                    ...workflow,
                    transitions: [
                      ...workflow.transitions,
                      { from: first, to: second, reasonRequired: false },
                    ],
                  });
              }}
            >
              Add transition
            </button>
          </section>
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
