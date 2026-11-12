import type {
  EntryResponse as Entry,
  EntryWorkflowCategory,
} from '@racepilot/contracts';
import {
  Button,
  DocumentList,
  KeyboardHintBar,
  PreviewPanel,
  StatusLabel,
} from '@racepilot/ui';
import type { WorkflowView } from '../entries/AdminEntriesModel.js';

const STATUS_DOCUMENT_KEYS = ['waiver', 'payment'] as const;
type StatusDocumentKey = (typeof STATUS_DOCUMENT_KEYS)[number];
function isStatusDocumentKey(key: string): key is StatusDocumentKey {
  return STATUS_DOCUMENT_KEYS.some((candidate) => candidate === key);
}

/** Workflow categories the preview may advance an entry into; terminal outcomes stay in the detail view. */
const PREVIEW_PROGRESS_CATEGORIES: readonly EntryWorkflowCategory[] = [
  'pending',
  'accepted',
  'waitlisted',
];

const STATUS_DOCUMENT_LABELS: Record<StatusDocumentKey, string> = {
  waiver: 'Haftverzicht Fahrer',
  payment: 'Startgeld',
};

export function EntryPreview({
  entry,
  workflow,
  onNextAction,
  onClose,
  onOpenDetail,
  onMessage,
  busy,
}: {
  entry: Entry;
  workflow: WorkflowView | null;
  onNextAction: (status: string) => Promise<void>;
  onClose: () => void;
  onOpenDetail: () => void;
  onMessage: () => void;
  busy: boolean;
}) {
  const details = entry.adminDetails;
  const status = entry.statusProjection?.dimensions;
  const next = status?.find((item) => item.key === 'entry')?.nextAction;
  const nextStatus = next?.key.startsWith('entry:') ? next.key.slice(6) : null;
  const nextCategory = workflow?.statuses.find(
    (item) => item.key === nextStatus,
  )?.category;
  const canAcceptNext = nextCategory === 'accepted';
  const canAdvance = Boolean(
    nextStatus &&
    PREVIEW_PROGRESS_CATEGORIES.some((category) => category === nextCategory),
  );
  const missing =
    status
      ?.filter(
        (item) =>
          ['payment', 'technical_inspection', 'waiver'].includes(item.key) &&
          item.required &&
          item.meaning !== 'done' &&
          item.meaning !== 'not_relevant',
      )
      .map((item) =>
        item.key === 'payment'
          ? 'die Zahlung'
          : item.key === 'technical_inspection'
            ? 'die technische Abnahme'
            : 'der Haftverzicht',
      ) ?? [];
  const missingText =
    missing.length > 1
      ? `${missing.slice(0, -1).join(', ')} und ${missing.at(-1)}`
      : missing[0];
  const documents =
    details?.customAnswers
      .filter((answer) => answer.fileDownloadUrl)
      .map((answer) => ({
        id: answer.key,
        label: answer.label,
        href: answer.fileDownloadUrl!,
        status: <StatusLabel status="done" label="Vorhanden" />,
      })) ?? [];
  const statusDocuments =
    status
      ?.filter((item): item is typeof item & { key: StatusDocumentKey } =>
        isStatusDocumentKey(item.key),
      )
      .map((item) => ({
        id: item.key,
        label: STATUS_DOCUMENT_LABELS[item.key],
        status: (
          <StatusLabel
            status={item.meaning === 'not_relevant' ? 'empty' : item.meaning}
            label={item.label.de}
          />
        ),
      })) ?? [];
  const allDocuments = [...documents, ...statusDocuments];
  return (
    <PreviewPanel
      eyebrow="Vorschau"
      number={entry.requestedStartNumber ?? details?.startNumber ?? null}
      title={details?.driver.name ?? 'Name nicht verfügbar'}
      subtitle={
        details
          ? `${details.vehicle.make} ${details.vehicle.model} · ${details.eventClass.name}`
          : 'Fahrzeug nicht verfügbar'
      }
      imageUrl={details?.vehicle.imageUrl ?? null}
      imageAlt="Fahrzeugbild"
      labels={status
        ?.filter((item) => ['entry', 'payment'].includes(item.key))
        .map((item) => (
          <StatusLabel
            key={item.key}
            status={
              item.key === 'payment' && item.meaning === 'not_relevant'
                ? 'empty'
                : item.meaning
            }
            label={item.label.de}
          />
        ))}
      onClose={onClose}
      closeLabel="Vorschau schließen"
      footer={
        <div className="nb-preview-actions">
          {canAdvance && nextStatus && next && (
            <Button
              disabled={busy}
              onClick={() => void onNextAction(nextStatus)}
            >
              {next.label.de}
            </Button>
          )}
          {!canAdvance && <p>Keine weitere Statusaktion verfügbar.</p>}
          {canAdvance && canAcceptNext && nextStatus && (
            <p className="nb-preview-hint">
              {missing.length
                ? `Es ${missing.length > 1 ? 'fehlen' : 'fehlt'} noch ${missingText}. Nach dem Zulassen springt die Vorschau zur nächsten offenen Nennung.`
                : 'Nach dem Zulassen springt die Vorschau zur nächsten offenen Nennung.'}
            </p>
          )}
          <div className="nb-preview-secondary-actions">
            <Button variant="secondary" onClick={onMessage}>
              Nachricht
            </Button>
            <Button variant="secondary" onClick={onOpenDetail}>
              Vollständig öffnen
            </Button>
          </div>
          <KeyboardHintBar
            items={[
              { keys: '↑ ↓', label: 'wechseln' },
              { keys: 'Enter', label: 'öffnen' },
              { keys: 'Esc', label: 'schließen' },
            ]}
          />
        </div>
      }
    >
      <DocumentList
        title="Unterlagen"
        items={allDocuments}
        empty={<p>Keine hochgeladenen Unterlagen vorhanden.</p>}
      />
    </PreviewPanel>
  );
}
