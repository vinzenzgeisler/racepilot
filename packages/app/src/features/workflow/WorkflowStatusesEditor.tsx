import {
  Button,
  Field,
  FormSection,
  SelectField,
  TextInput,
} from '@racepilot/ui';
import type { Status, Workflow } from './AdminWorkflow.js';

const categories = [
  ['pending', 'Offen'],
  ['accepted', 'Zugelassen'],
  ['rejected', 'Abgelehnt'],
  ['waitlisted', 'Warteliste'],
  ['withdrawn', 'Zurückgezogen'],
] as const;

export function WorkflowStatusesEditor({
  workflow,
  updateStatus,
  updateWorkflow,
}: {
  workflow: Workflow;
  updateStatus: (index: number, patch: Partial<Status>) => void;
  updateWorkflow: (workflow: Workflow) => void;
}) {
  return (
    <FormSection
      title="Nennungsstatus"
      description="Lege die sichtbaren Status und ihre Bedeutung fest."
    >
      {workflow.statuses.map((status, index) => (
        <FormSection key={index} title={status.labels.de || 'Neuer Status'}>
          <div className="workflow-fields">
            <TextInput
              label="Interner Schlüssel"
              aria-label={'Status ' + (index + 1) + ' Schlüssel'}
              value={status.key}
              onChange={(event) =>
                updateStatus(index, { key: event.target.value })
              }
            />
            <TextInput
              label="Deutsche Bezeichnung"
              aria-label={'Status ' + (index + 1) + ' Bezeichnung'}
              value={status.labels.de}
              onChange={(event) =>
                updateStatus(index, {
                  labels: { ...status.labels, de: event.target.value },
                })
              }
            />
            <TextInput
              label="Englische Bezeichnung"
              aria-label={'Status ' + (index + 1) + ' englische Bezeichnung'}
              value={status.labels.en}
              onChange={(event) =>
                updateStatus(index, {
                  labels: { ...status.labels, en: event.target.value },
                })
              }
            />
            <Field
              label="Statusfarbe"
              aria-label={'Status ' + (index + 1) + ' Farbe'}
              type="color"
              value={
                /^#[0-9a-f]{6}$/i.test(status.color) ? status.color : '#000000'
              }
              onChange={(event) =>
                updateStatus(index, { color: event.target.value })
              }
            />
            <SelectField
              label="Bedeutung"
              aria-label={'Status ' + (index + 1) + ' Bedeutung'}
              value={status.category}
              onChange={(event) =>
                updateStatus(index, { category: event.target.value })
              }
            >
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <Button
              variant="danger"
              size={40}
              confirmation={{
                title: 'Status entfernen?',
                message:
                  'Der Status und alle zugehörigen Übergänge werden entfernt.',
                reasonLabel: 'Grund',
                cancelLabel: 'Abbrechen',
                confirmLabel: 'Status entfernen',
                closeLabel: 'Dialog schließen',
              }}
              onDangerConfirm={() =>
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
              Status entfernen
            </Button>
          </div>
        </FormSection>
      ))}
      <Button
        variant="secondary"
        size={40}
        onClick={() =>
          updateWorkflow({
            ...workflow,
            statuses: [
              ...workflow.statuses,
              {
                key: 'status_' + (workflow.statuses.length + 1),
                labels: { en: 'New status', de: 'Neuer Status' },
                color: '#64748b',
                category: 'pending',
              },
            ],
          })
        }
      >
        Status hinzufügen
      </Button>
    </FormSection>
  );
}
