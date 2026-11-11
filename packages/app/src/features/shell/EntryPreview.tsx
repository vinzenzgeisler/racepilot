import type { EntryResponse as Entry } from '@racepilot/contracts';
import {
  Button,
  DocumentList,
  KeyboardHintBar,
  PreviewPanel,
  StatusLabel,
} from '@racepilot/ui';

const STATUS_DOCUMENT_KEYS = ['waiver', 'payment'] as const;
const STATUS_DOCUMENT_LABELS: Record<
  (typeof STATUS_DOCUMENT_KEYS)[number],
  string
> = {
  waiver: 'Haftverzicht Fahrer',
  payment: 'Startgeld',
};

export function EntryPreview({
  entry,
  onNextAction,
  onClose,
  onOpenDetail,
  busy,
}: {
  entry: Entry;
  onNextAction: (status: string) => Promise<void>;
  onClose: () => void;
  onOpenDetail: () => void;
  busy: boolean;
}) {
  const details = entry.adminDetails;
  const status = entry.statusProjection?.dimensions;
  const next = status?.find((item) => item.key === 'entry')?.nextAction;
  const nextStatus = next?.key.startsWith('entry:') ? next.key.slice(6) : null;
  const canAcceptNext = next?.label.de === 'Zulassen';
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
      ?.filter((item) => STATUS_DOCUMENT_KEYS.some((key) => key === item.key))
      .map((item) => ({
        id: item.key,
        label:
          STATUS_DOCUMENT_LABELS[
            item.key as keyof typeof STATUS_DOCUMENT_LABELS
          ],
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
          {nextStatus && next && (
            <Button
              disabled={busy}
              onClick={() => void onNextAction(nextStatus)}
            >
              {next.label.de}
            </Button>
          )}
          {!nextStatus && <p>Keine weitere Statusaktion verfügbar.</p>}
          {nextStatus && canAcceptNext && (
            <p className="nb-preview-hint">
              {missing.length
                ? `Es ${missing.length > 1 ? 'fehlen' : 'fehlt'} noch ${missingText}. Nach dem Zulassen springt die Vorschau zur nächsten offenen Nennung.`
                : 'Nach dem Zulassen springt die Vorschau zur nächsten offenen Nennung.'}
            </p>
          )}
          <div className="nb-preview-secondary-actions">
            <Button variant="secondary" disabled>
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
