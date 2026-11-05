import type { EntryResponse as Entry } from '@racepilot/contracts';
import {
  ActionPanel,
  Button,
  DocumentList,
  HistoryTimeline,
  PreviewPanel,
  StatusLabel,
} from '@racepilot/ui';

export function EntryPreview({
  entry,
  onNextAction,
  onClose,
  busy,
}: {
  entry: Entry;
  onNextAction: (status: string) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const details = entry.adminDetails;
  const status = entry.statusProjection?.dimensions;
  const next = status?.find((item) => item.key === 'entry')?.nextAction;
  const documents =
    details?.customAnswers
      .filter((answer) => answer.fileDownloadUrl)
      .map((answer) => ({
        id: answer.key,
        label: answer.label,
        href: answer.fileDownloadUrl!,
        status: <StatusLabel status="done" label="Vorhanden" />,
      })) ?? [];
  const history =
    entry.adminHistory?.map((item) => ({
      id: item.id,
      time: new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Berlin',
      }).format(new Date(item.occurredAt)),
      content: (
        <>
          <strong>{item.label}</strong>
          {item.detail && <p>{item.detail}</p>}
        </>
      ),
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
        <Button
          variant="secondary"
          onClick={() =>
            document
              .querySelector('.admin-detail')
              ?.scrollIntoView({ behavior: 'smooth' })
          }
        >
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
          next ? 'Die Entscheidung wird im Verlauf protokolliert.' : ''
        }
        action={
          next ? (
            <Button disabled={busy} onClick={() => void onNextAction(next.key)}>
              {next.label.de}
            </Button>
          ) : (
            <p>Keine weitere Statusaktion verfügbar.</p>
          )
        }
      />
      <HistoryTimeline
        title="Verlauf"
        items={history}
        empty={<p>Noch kein Verlauf vorhanden.</p>}
      />
    </PreviewPanel>
  );
}
