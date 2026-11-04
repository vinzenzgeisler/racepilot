import { adminFetch } from './auth.js';
import { useEffect, useState } from 'react';
import { EventSchema } from '@racepilot/contracts';
import { WorkflowEditor } from './WorkflowEditor.js';

export type Event = ReturnType<typeof EventSchema.parse>;
export type Status = {
  key: string;
  labels: { de: string; en: string };
  color: string;
  category: string;
};
export type Transition = {
  from: string;
  to: string;
  reasonRequired: boolean;
  permission?: string;
  roles?: Array<'admin' | 'member'> | undefined;
  notify?: boolean;
};
export type Workflow = {
  version: number;
  statuses: Status[];
  transitions: Transition[];
};
export type Revision = { id: string; version: number; workflow: Workflow };

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
    adminFetch(
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
      const response = await adminFetch(
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
    <WorkflowEditor
      eventId={eventId}
      events={events}
      loading={loading}
      workflow={workflow}
      revision={revision}
      updateStatus={updateStatus}
      updateWorkflow={updateWorkflow}
      updateTransition={updateTransition}
      reason={reason}
      setReason={setReason}
      busy={busy}
      save={save}
      message={message}
    />
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
