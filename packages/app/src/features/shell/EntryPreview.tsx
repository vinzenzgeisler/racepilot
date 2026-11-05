import type { EntryResponse as Entry } from '@racepilot/contracts';
import { Button, StatusLabel } from '@racepilot/ui';

export function EntryPreview({
  entry,
  onNextAction,
  busy,
}: {
  entry: Entry;
  onNextAction: (status: string) => Promise<void>;
  busy: boolean;
}) {
  const details = entry.adminDetails;
  const status = entry.statusProjection?.dimensions;
  const next = status?.find((item) => item.key === 'entry')?.nextAction;
  return (
    <div className="entry-preview-content">
      <p className="app-eyebrow">Vorschau</p>
      <div className="entry-preview-heading">
        <strong>{entry.requestedStartNumber ?? entry.adminDetails?.startNumber ?? '—'}</strong>
        <div>
          <h2 className="entry-preview-name">
            {details?.driver.name ?? 'Name nicht verfügbar'}
          </h2>
          <p className="entry-preview-subtitle">
            {details
              ? `${details.vehicle.make} ${details.vehicle.model}`
              : 'Fahrzeug nicht verfügbar'}
            {details?.eventClass.name ? ` · ${details.eventClass.name}` : ''}
          </p>
        </div>
      </div>
      <div className="entry-preview-labels">
        {status
          ?.filter((item) => ['entry', 'payment'].includes(item.key))
          .map((item) => (
            <StatusLabel
              key={item.key}
              status={item.meaning}
              label={item.label.de}
            />
          ))}
      </div>
      {details?.vehicle.imageUrl ? (
        <img
          className="app-preview-vehicle"
          src={details.vehicle.imageUrl}
          alt="Fahrzeugbild"
        />
      ) : (
        <div className="app-preview-vehicle">Kein Fahrzeugbild verfügbar</div>
      )}
      <section className="entry-preview-documents">
        <h3>Unterlagen</h3>
        <p className="entry-preview-note">
          Unterlagenstatus ist für diese Nennung noch nicht verfügbar.
        </p>
        <dl>
          {status
            ?.filter((item) =>
              ['technical_inspection', 'waiver'].includes(item.key),
            )
            .map((item) => (
              <div className="entry-preview-document" key={item.key}>
                <dt>
                  {item.key === 'waiver'
                    ? 'Haftverzicht'
                    : 'Technische Abnahme'}
                </dt>
                <dd>
                  <StatusLabel status={item.meaning} label={item.label.de} />
                </dd>
              </div>
            ))}
        </dl>
      </section>
      <section className="entry-preview-action">
        <p className="app-eyebrow">Nächster Schritt</p>
        {next ? (
          <>
            <Button
              variant="primary"
              size={40}
              disabled={busy}
              onClick={() => void onNextAction(next.key)}
            >
              {next.label.de}
            </Button>
            <p>
              Der Status wird protokolliert; die Nennung bleibt vollständig
              prüfbar.
            </p>
          </>
        ) : (
          <p className="entry-preview-hint">
            Keine weitere Statusaktion verfügbar.
          </p>
        )}
      </section>
      <div className="entry-preview-footer">
        <Button
          variant="secondary"
          size={40}
          onClick={() =>
            document
              .querySelector('.admin-detail')
              ?.scrollIntoView({ behavior: 'smooth' })
          }
        >
          Vollständig öffnen
        </Button>
      </div>
      <p className="entry-preview-keys">
        ↑ ↓ Wechseln · Enter öffnen · Esc schließen
      </p>
    </div>
  );
}
