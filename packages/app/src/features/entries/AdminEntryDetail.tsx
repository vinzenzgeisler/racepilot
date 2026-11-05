import { AdminFileDownload } from './AdminFileDownload.js';
import { Button, Textarea } from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { WorkflowView } from './AdminEntriesModel.js';
import { EntryStatusBadge } from './EntryStatusBadge.js';

export function AdminEntryDetail({
  selected,
  classes,
  workflow,
  reason,
  setReason,
  busy,
  transition,
}: {
  selected: Entry;
  classes: Array<{ id: string; name: string }>;
  workflow: WorkflowView | null;
  reason: string;
  setReason: (reason: string) => void;
  busy: boolean;
  transition: (
    type: 'acceptance' | 'verification',
    status: string,
  ) => Promise<void>;
}) {
  return (
    <section className="admin-detail" aria-labelledby="entry-detail-title">
      <h3 id="entry-detail-title">Nennung im Detail</h3>
      <dl>
        <dt>Klasse</dt>
        <dd>
          {selected.adminDetails?.eventClass.name ??
            classes.find((item) => item.id === selected.classId)?.name ??
            '—'}
        </dd>
        <dt>Fahrer</dt>
        <dd>{selected.adminDetails?.driver.name ?? '—'}</dd>
        <dt>Geburtsdatum</dt>
        <dd>
          {selected.adminDetails?.driver.dateOfBirth
            ? new Intl.DateTimeFormat('de-DE', {
                dateStyle: 'medium',
                timeZone: 'Europe/Berlin',
              }).format(
                new Date(
                  `${selected.adminDetails.driver.dateOfBirth}T12:00:00`,
                ),
              )
            : '—'}
        </dd>
        <dt>Land</dt>
        <dd>{selected.adminDetails?.driver.country ?? '—'}</dd>
        <dt>E-Mail</dt>
        <dd>
          {selected.adminDetails?.driver.email ?? '—'}{' '}
          {selected.adminDetails?.driver.emailVerified ? '✓' : ''}
        </dd>
        <dt>Fahrzeug</dt>
        <dd>
          {selected.adminDetails
            ? `${selected.adminDetails.vehicle.make} ${selected.adminDetails.vehicle.model}${selected.adminDetails.vehicle.year ? ` · ${selected.adminDetails.vehicle.year}` : ''}`
            : '—'}
        </dd>
        <dt>Startnummer</dt>
        <dd>{selected.adminDetails?.startNumber ?? '—'}</dd>
        <dt>Eigene Angaben</dt>
        <dd>
          {selected.adminDetails?.customAnswers.length ? (
            <ul className="admin-custom-answers">
              {selected.adminDetails.customAnswers.map((answer) => (
                <li key={answer.key}>
                  <strong>{answer.label}</strong>:{' '}
                  {answer.fileDownloadUrl ? (
                    <AdminFileDownload url={answer.fileDownloadUrl} />
                  ) : answer.value === null ? (
                    '—'
                  ) : typeof answer.value === 'boolean' ? (
                    answer.value ? (
                      'Ja'
                    ) : (
                      'Nein'
                    )
                  ) : (
                    answer.value
                  )}
                </li>
              ))}
            </ul>
          ) : (
            'Keine eigenen Angaben'
          )}
        </dd>
        <dt>Nennung</dt>
        <dd>
          <EntryStatusBadge
            status={workflow?.statuses.find(
              (item) => item.key === selected.acceptanceStatus,
            )}
            fallback={selected.acceptanceStatus}
          />
        </dd>
        <dt>E-Mail-Prüfung</dt>
        <dd>
          {selected.verificationStatus === 'verified'
            ? 'Verifiziert'
            : 'Unbestätigt'}
        </dd>
        <dt>Startgeld gesamt</dt>
        <dd>
          {selected.priceSnapshot
            ? new Intl.NumberFormat('de-DE', {
                style: 'currency',
                currency: selected.priceSnapshot.currency,
              }).format(selected.priceSnapshot.totalCents / 100)
            : 'Nicht verfügbar'}
        </dd>
      </dl>
      <Textarea
        label="Begründung (für das Protokoll erforderlich)"
        value={reason}
        maxLength={1000}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="admin-actions">
        {(workflow?.transitions ?? [])
          .filter((edge) => edge.from === selected.acceptanceStatus)
          .map((edge) => {
            const status = workflow?.statuses.find(
              (item) => item.key === edge.to,
            );
            return (
              <Button
                key={edge.to}
                variant="secondary"
                size={40}
                disabled={busy || !reason.trim()}
                onClick={() => void transition('acceptance', edge.to)}
              >
                <EntryStatusBadge status={status} fallback={edge.to} />
              </Button>
            );
          })}
        {selected.verificationStatus !== 'verified' && (
          <Button
            variant="secondary"
            size={40}
            disabled={busy || !reason.trim()}
            onClick={() => void transition('verification', 'verified')}
          >
            E-Mail verifizieren
          </Button>
        )}
      </div>
      <section className="admin-documents" aria-label="Prüfstatus">
        <h4>Prüfstatus</h4>
        <p>
          Echte Nennungsunterlagen und Upload-Zähler sind noch nicht verfügbar.
        </p>
        <ul>
          {selected.statusProjection?.dimensions
            .filter((item) =>
              ['technical_inspection', 'waiver'].includes(item.key),
            )
            .map((item) => (
              <li key={item.key}>
                <span>{item.label.de}</span>
                <strong>{item.label.de}</strong>
              </li>
            ))}
        </ul>
      </section>
      <section aria-label="Verlauf">
        <h4>Verlauf</h4>
        <ol>
          {(selected.adminHistory ?? []).map((event) => (
            <li key={`${event.kind}-${event.id}`}>
              <time dateTime={event.occurredAt}>
                {new Intl.DateTimeFormat('de-DE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/Berlin',
                }).format(new Date(event.occurredAt))}
              </time>{' '}
              · {event.label} · {event.actor}
              {event.detail ? ` — ${event.detail}` : ''}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
