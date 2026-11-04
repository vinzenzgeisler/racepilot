import type { WorkflowEditorProps } from './WorkflowEditorProps.js';

export function WorkflowEditor({
  eventId,
  events,
  loading,
  workflow,
  revision,
  updateStatus,
  updateWorkflow,
  updateTransition,
  reason,
  setReason,
  busy,
  save,
  message,
}: WorkflowEditorProps) {
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
              <fieldset key={index}>
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
