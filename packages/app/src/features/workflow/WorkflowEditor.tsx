import { Button, PageHeader, TextInput } from '@racepilot/ui';
import { WorkflowStatusesEditor } from './WorkflowStatusesEditor.js';
import { WorkflowTransitionsEditor } from './WorkflowTransitionsEditor.js';
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
  const selectedEvent = events.find((event) => event.id === eventId);
  if (!eventId) {
    return (
      <section className="admin-workflow" aria-labelledby="workflow-title">
        <PageHeader id="workflow-title" title="Nennungsablauf" />
        <p>Wähle zuerst eine Veranstaltung aus.</p>
      </section>
    );
  }
  if (loading) {
    return (
      <section className="admin-workflow" aria-labelledby="workflow-title">
        <PageHeader id="workflow-title" title="Nennungsablauf" />
        <p role="status">Ablauf wird geladen …</p>
      </section>
    );
  }
  if (!workflow) {
    return (
      <section className="admin-workflow" aria-labelledby="workflow-title">
        <PageHeader id="workflow-title" title="Nennungsablauf" />
        <p role="alert">
          Der Nennungsablauf ist ungültig oder konnte nicht geladen werden.
        </p>
      </section>
    );
  }

  return (
    <section className="admin-workflow" aria-labelledby="workflow-title">
      <PageHeader
        id="workflow-title"
        title="Nennungsablauf"
        {...(selectedEvent?.name ? { description: selectedEvent.name } : {})}
      />
      <p className="workflow-revision">
        Aktive Version {revision?.version ?? 'nicht verfügbar'}
      </p>

      <WorkflowStatusesEditor
        workflow={workflow}
        updateStatus={updateStatus}
        updateWorkflow={updateWorkflow}
      />
      <WorkflowTransitionsEditor
        workflow={workflow}
        updateTransition={updateTransition}
        updateWorkflow={updateWorkflow}
      />

      <TextInput
        label="Begründung für die Aktivierung"
        hint="Die Begründung wird im Änderungsprotokoll gespeichert."
        aria-label="Begründung für die Aktivierung"
        value={reason}
        maxLength={1000}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        variant="primary"
        disabled={busy || !reason.trim()}
        onClick={() => void save()}
      >
        Ablauf prüfen und aktivieren
      </Button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
