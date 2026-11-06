import type { EntryResponse as Entry } from '@racepilot/contracts';
import {
  ActionPanel,
  Button,
  DocumentList,
  PreviewPanel,
  StatusLabel,
} from '@racepilot/ui';

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
  const documents =
    details?.customAnswers
      .filter((answer) => answer.fileDownloadUrl)
      .map((answer) => ({
        id: answer.key,
        label: answer.label,
        href: answer.fileDownloadUrl!,
        status: <StatusLabel status="done" label="Vorhanden" />,
      })) ?? [];
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
        ?.filter((item) =>
          ['entry', 'payment', 'technical_inspection', 'waiver'].includes(
            item.key,
          ),
        )
        .map((item) => (
          <StatusLabel
            key={item.key}
            status={item.meaning}
            label={item.label.de}
          />
        ))}
      onClose={onClose}
      closeLabel="Vorschau schließen"
      footer={
        <Button variant="secondary" onClick={onOpenDetail}>
          Vollständig öffnen
        </Button>
      }
    >
      <DocumentList
        title="Unterlagen"
        items={documents}
        empty={<p>Keine hochgeladenen Unterlagen vorhanden.</p>}
      />
      <ActionPanel
        title="Nächster Schritt"
        hint={
          missing.length
            ? `Es fehlt noch ${missing.join(', ')}. Die Entscheidung wird protokolliert.`
            : 'Die Entscheidung wird im Verlauf protokolliert.'
        }
        action={
          nextStatus ? (
            <Button
              disabled={busy}
              onClick={() => void onNextAction(nextStatus)}
            >
              {nextStatus === 'accepted'
                ? 'Zulassen'
                : (next?.label.de ?? 'Status ändern')}
            </Button>
          ) : (
            <p>Keine weitere Statusaktion verfügbar.</p>
          )
        }
      />
    </PreviewPanel>
  );
}
