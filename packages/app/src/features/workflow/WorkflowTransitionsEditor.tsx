import {
  Button,
  Checkbox,
  FormSection,
  SelectField,
  TextInput,
} from '@racepilot/ui';
import type { Transition, Workflow } from './AdminWorkflow.js';

export function WorkflowTransitionsEditor({
  workflow,
  updateTransition,
  updateWorkflow,
}: {
  workflow: Workflow;
  updateTransition: (index: number, patch: Partial<Transition>) => void;
  updateWorkflow: (workflow: Workflow) => void;
}) {
  return (
    <FormSection
      title="Erlaubte Übergänge"
      description="Bestimme, welche Statusänderungen möglich sind."
    >
      {workflow.transitions.map((edge, index) => (
        <FormSection key={index} title={'Übergang ' + (index + 1)}>
          <div className="workflow-fields">
            <SelectField
              label="Von"
              aria-label={'Übergang ' + (index + 1) + ' von'}
              value={edge.from}
              onChange={(event) =>
                updateTransition(index, { from: event.target.value })
              }
            >
              {workflow.statuses.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.labels.de}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Zu"
              aria-label={'Übergang ' + (index + 1) + ' zu'}
              value={edge.to}
              onChange={(event) =>
                updateTransition(index, { to: event.target.value })
              }
            >
              {workflow.statuses.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.labels.de}
                </option>
              ))}
            </SelectField>
            <Checkbox
              aria-label={
                'Übergang ' + (index + 1) + ' Begründung erforderlich'
              }
              label="Begründung erforderlich"
              checked={edge.reasonRequired}
              onChange={(event) =>
                updateTransition(index, {
                  reasonRequired: event.target.checked,
                })
              }
            />
            <Checkbox
              aria-label={'Übergang ' + (index + 1) + ' Fahrer benachrichtigen'}
              label="Teilnehmende per E-Mail benachrichtigen"
              checked={edge.notify ?? false}
              onChange={(event) =>
                updateTransition(index, { notify: event.target.checked })
              }
            />
            <FormSection title="Zulässige Rollen">
              {(['admin', 'member'] as const).map((role) => (
                <Checkbox
                  key={role}
                  aria-label={'Übergang ' + (index + 1) + ' Rolle ' + role}
                  label={
                    role === 'admin' ? 'Veranstaltungsleitung' : 'Teammitglied'
                  }
                  checked={edge.roles?.includes(role) ?? false}
                  onChange={(event) => {
                    const roles = new Set(edge.roles ?? []);
                    if (event.target.checked) roles.add(role);
                    else roles.delete(role);
                    updateTransition(index, {
                      roles: roles.size ? [...roles] : undefined,
                    });
                  }}
                />
              ))}
              <p>Ohne Auswahl gilt die Berechtigung „Nennung bearbeiten“.</p>
            </FormSection>
            <TextInput
              label="Technischer Berechtigungsschlüssel (optional)"
              aria-label={'Übergang ' + (index + 1) + ' Berechtigung'}
              value={edge.permission ?? ''}
              onChange={(event) =>
                updateTransition(index, { permission: event.target.value })
              }
              placeholder="entry:write"
            />
            <Button
              variant="danger"
              size={40}
              confirmation={{
                title: 'Übergang entfernen?',
                message: 'Diese Statusänderung ist danach nicht mehr möglich.',
                reasonLabel: 'Grund',
                cancelLabel: 'Abbrechen',
                confirmLabel: 'Übergang entfernen',
                closeLabel: 'Dialog schließen',
              }}
              onDangerConfirm={() =>
                updateWorkflow({
                  ...workflow,
                  transitions: workflow.transitions.filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            >
              Übergang entfernen
            </Button>
          </div>
        </FormSection>
      ))}
      <Button
        variant="secondary"
        size={40}
        disabled={workflow.statuses.length < 2}
        onClick={() => {
          const from = workflow.statuses[0]?.key;
          const to = workflow.statuses[1]?.key;
          if (from && to)
            updateWorkflow({
              ...workflow,
              transitions: [
                ...workflow.transitions,
                { from, to, reasonRequired: false },
              ],
            });
        }}
      >
        Übergang hinzufügen
      </Button>
    </FormSection>
  );
}
