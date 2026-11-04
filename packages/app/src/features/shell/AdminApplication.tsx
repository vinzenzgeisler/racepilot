import { Button } from '@racepilot/ui';
import { useEffect, useState } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { AdminEntries } from '../entries/AdminEntries.js';
import { AdminModules } from '../modules/AdminModules.js';
import { AppShell, type ShellModule } from './AppShell.js';
import { RegistrationFormSettings } from '../registration/RegistrationFormSettings.js';
import { adminFetch, restoreAdminSession, signIn } from '../../auth.js';

export function AuthenticatedAdmin() {
  const [session, setSession] = useState<
    'loading' | 'ready' | 'signed-out' | 'disabled' | 'error'
  >('loading');
  useEffect(() => {
    let active = true;
    void restoreAdminSession()
      .then((result) => {
        if (active) setSession(result);
      })
      .catch(() => {
        if (active) setSession('error');
      });
    return () => {
      active = false;
    };
  }, []);
  if (session === 'loading')
    return (
      <main className="shell" aria-busy="true">
        <p role="status">NENNBOX lädt…</p>
      </main>
    );
  if (session === 'ready') return <AdminApplication />;
  return (
    <main className="shell">
      <h1>NENNBOX</h1>
      {session === 'signed-out' ? (
        <>
          <p>Bitte anmelden, um die Veranstaltung zu verwalten.</p>
          <Button
            onClick={() => void signIn().catch(() => setSession('error'))}
          >
            Anmelden
          </Button>
        </>
      ) : (
        <p role="alert">
          {session === 'disabled'
            ? 'Die Anmeldung ist noch nicht eingerichtet.'
            : 'Die Anmeldung ist derzeit nicht verfügbar.'}
        </p>
      )}
    </main>
  );
}

function AdminApplication() {
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [modules, setModules] = useState<ShellModule[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const closePreview = () => setPreviewOpen(false);
  useEffect(() => {
    let active = true;
    void adminFetch('/admin/events', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown) => {
        if (!active || !Array.isArray(rows)) return;
        const parsed = rows.flatMap((row) => {
          if (!row || typeof row !== 'object') return [];
          const value = row as { id?: unknown; name?: unknown };
          return typeof value.id === 'string' && typeof value.name === 'string'
            ? [{ id: value.id, name: value.name }]
            : [];
        });
        setEvents(parsed);
        setSelectedEvent((current) => current || parsed[0]?.id || '');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!selectedEvent) return;
    let active = true;
    void adminFetch(
      `/admin/events/${encodeURIComponent(selectedEvent)}/modules`,
      {
        credentials: 'same-origin',
        cache: 'no-store',
      },
    )
      .then((response) => (response.ok ? response.json() : { modules: [] }))
      .then((payload: unknown) => {
        if (
          !active ||
          !payload ||
          typeof payload !== 'object' ||
          !Array.isArray((payload as { modules?: unknown }).modules)
        )
          return;
        setModules(
          (
            payload as { modules: Array<Record<string, unknown>> }
          ).modules.flatMap((module) => {
            const gallery = module.gallery as
              Record<string, unknown> | undefined;
            if (
              typeof module.id !== 'string' ||
              typeof module.displayName !== 'string' ||
              !gallery ||
              !['core', 'official', 'private'].includes(String(gallery.source))
            )
              return [];
            return [
              {
                id: module.id,
                displayName: module.displayName,
                source: gallery.source as ShellModule['source'],
                enabled: module.status === 'active',
                ...(typeof module.navigationLabel === 'string'
                  ? { navigationLabel: module.navigationLabel }
                  : {}),
              },
            ];
          }),
        );
      })
      .catch(() => setModules([]));
    return () => {
      active = false;
    };
  }, [selectedEvent]);
  return (
    <AppShell
      events={events}
      activeEvent={selectedEvent}
      modules={modules}
      onEventChange={setSelectedEvent}
      previewOpen={previewOpen}
      onClosePreview={closePreview}
      preview={
        selectedEntry ? (
          <>
            <p className="app-eyebrow">
              VORSCHAU ·{' '}
              {selectedEntry.requestedStartNumber ?? 'OHNE STARTNUMMER'}
            </p>
            <div
              className="app-preview-vehicle"
              aria-label="Kein Fahrzeugbild verfügbar"
            >
              <span aria-hidden="true">▧</span>
            </div>
            {selectedEntry.adminDetails && (
              <p>
                {selectedEntry.adminDetails.driver.name} ·{' '}
                {selectedEntry.adminDetails.vehicle.make}{' '}
                {selectedEntry.adminDetails.vehicle.model}
              </p>
            )}
            <h2>
              Nennung{' '}
              {selectedEntry.requestedStartNumber ??
                selectedEntry.id.slice(0, 8)}
            </h2>
            <p>
              {selectedEntry.statusProjection?.documents.complete ?? 0}/
              {selectedEntry.statusProjection?.documents.total ?? 0} Unterlagen
              geprüft
            </p>
            <ul className="app-preview-status">
              {selectedEntry.statusProjection?.dimensions.map((status) => (
                <li key={status.key}>
                  <span>{status.label.de}</span>
                  <strong>{status.value}</strong>
                  {status.nextAction && (
                    <small>Nächste Aktion: {status.nextAction.label.de}</small>
                  )}
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size={40}
              onClick={() =>
                document
                  .querySelector<HTMLButtonElement>('[data-selected-entry]')
                  ?.click()
              }
            >
              Vollständige Details öffnen
            </Button>
            <div className="app-preview-extra">
              <h3>Verlauf und Nachrichten</h3>
              {(selectedEntry.adminHistory ?? [])
                .slice(-3)
                .reverse()
                .map((item) => (
                  <p key={item.id}>
                    {new Date(item.occurredAt).toLocaleString()} · {item.label}{' '}
                    · {item.actor}
                  </p>
                ))}
            </div>
          </>
        ) : undefined
      }
    >
      {(view) =>
        view === 'entries' || view === 'onsite' ? (
          <AdminEntries
            eventId={selectedEvent}
            onEventChange={setSelectedEvent}
            onSelectionChange={(entry) => {
              setSelectedEntry(entry);
              if (entry) setPreviewOpen(true);
            }}
          />
        ) : view === 'modules' ? (
          <AdminModules
            locale={
              navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
            }
          />
        ) : view === 'account' ? (
          <RegistrationFormSettings eventId={selectedEvent} />
        ) : (
          <section className="app-empty-view">
            <h2>
              {view === 'communication' ? 'Nachrichten' : 'Einstellungen'}
            </h2>
            <p>
              Dieser Bereich ist in dieser Veranstaltung noch nicht
              eingerichtet.
            </p>
          </section>
        )
      }
    </AppShell>
  );
}
