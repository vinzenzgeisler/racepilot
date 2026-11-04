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
      <h3 id="entry-detail-title">Entry detail</h3>
      <dl>
        <dt>Entry ID</dt>
        <dd>{selected.id}</dd>
        <dt>Class</dt>
        <dd>
          {classes.find((item) => item.id === selected.classId)?.name ??
            selected.classId}
        </dd>
        <dt>Registration group</dt>
        <dd>{selected.registrationGroupId}</dd>
        <dt>Fahrer</dt>
        <dd>{selected.adminDetails?.driver.name ?? selected.driverPersonId}</dd>
        <dt>Geburtsdatum</dt>
        <dd>{selected.adminDetails?.driver.dateOfBirth ?? '—'}</dd>
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
            : selected.vehicleId}
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
                    <a href={answer.fileDownloadUrl}>Datei herunterladen</a>
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
        <dt>Acceptance</dt>
        <dd>
          <EntryStatusBadge
            status={workflow?.statuses.find(
              (item) => item.key === selected.acceptanceStatus,
            )}
            fallback={selected.acceptanceStatus}
          />
        </dd>
        <dt>Verification</dt>
        <dd>{selected.verificationStatus}</dd>
        <dt>Price snapshot total</dt>
        <dd>
          {selected.priceSnapshot
            ? new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: selected.priceSnapshot.currency,
              }).format(selected.priceSnapshot.totalCents / 100)
            : 'Not available'}
        </dd>
      </dl>
      <label>
        Reason (required for audit)
        <textarea
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="admin-actions">
        {(workflow?.transitions ?? [])
          .filter((edge) => edge.from === selected.acceptanceStatus)
          .map((edge) => {
            const status = workflow?.statuses.find(
              (item) => item.key === edge.to,
            );
            return (
              <button
                key={edge.to}
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => void transition('acceptance', edge.to)}
              >
                <EntryStatusBadge status={status} fallback={edge.to} />
              </button>
            );
          })}
        {selected.verificationStatus !== 'verified' && (
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => void transition('verification', 'verified')}
          >
            Mark verified
          </button>
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
                <strong>{item.value}</strong>
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
                {new Date(event.occurredAt).toLocaleString()}
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
