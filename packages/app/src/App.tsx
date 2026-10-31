import { Button } from '@racepilot/ui';
import { useEffect, useState, type ReactNode } from 'react';
import {
  RuntimeBootstrapResponse,
  type RuntimeBootstrapResponse as RuntimeConfig,
} from '@racepilot/contracts';
import './styles.css';
import { Registration, RegistrationVerification } from './Registration.js';
import { AdminEntries } from './AdminEntries.js';
import { AdminModules } from './AdminModules.js';
import { ComponentGallery } from './ComponentGallery.js';
import { AppShell, type ShellModule } from './AppShell.js';
import type { EntryResponse as Entry } from '@racepilot/contracts';

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; config: RuntimeConfig };

export interface AppProps {
  renderContribution?: (config: RuntimeConfig) => ReactNode;
}

export function App({ renderContribution }: AppProps = {}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const isAdmin =
    window.location.pathname.startsWith('/admin') ||
    window.location.pathname.startsWith('/app');
  const isComponentGallery = window.location.pathname === '/components';
  useEffect(() => {
    if (isAdmin || isComponentGallery) return;
    let current = true;
    fetch('/runtime/bootstrap', {
      credentials: 'same-origin',
      cache: 'no-cache',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Runtime unavailable');
        return response.json();
      })
      .then((payload: unknown) => RuntimeBootstrapResponse.parse(payload))
      .then((config) => {
        if (current) setState({ kind: 'ready', config });
      })
      .catch(() => {
        if (current) setState({ kind: 'unavailable' });
      });
    return () => {
      current = false;
    };
  }, [isAdmin, isComponentGallery]);

  if (isComponentGallery) return <ComponentGallery />;

  if (isAdmin) return <AdminApplication />;

  if (state.kind === 'loading')
    return (
      <main className="shell" aria-busy="true">
        <p role="status">Loading RacePilot…</p>
      </main>
    );
  if (state.kind === 'unavailable')
    return (
      <main className="shell">
        <h1>RacePilot</h1>
        <p role="alert">This service is currently unavailable.</p>
      </main>
    );

  const { config } = state;
  if (window.location.pathname === '/registration/verify')
    return (
      <main className="shell">
        <RegistrationVerification locale={config.locale} />
      </main>
    );
  const registrationMatch = window.location.pathname.match(
    /^\/events\/([^/]+)\/register\/?$/,
  );
  if (registrationMatch)
    return (
      <main className="shell">
        <Registration
          organizationId={config.organization.id}
          eventSlug={decodeURIComponent(registrationMatch[1]!)}
          defaultLocale={config.locale}
        />
      </main>
    );
  return (
    <main
      className="shell"
      style={
        {
          '--brand-primary': config.branding.primaryColor,
          '--brand-accent': config.branding.accentColor,
        } as React.CSSProperties
      }
    >
      <header className="masthead">
        {config.branding.logoUrl ? (
          <img className="logo" src={config.branding.logoUrl} alt="" />
        ) : null}
        <div>
          <p className="eyebrow">RacePilot · {config.deploymentMode}</p>
          <h1>{config.organization.name}</h1>
        </div>
      </header>
      {config.activeEvent ? (
        <section aria-labelledby="event-title">
          <h2 id="event-title">{config.activeEvent.name}</h2>
          {config.branding.eventImageUrl ? (
            <img
              className="event-image"
              src={config.branding.eventImageUrl}
              alt=""
            />
          ) : null}
        </section>
      ) : (
        <p>No active event.</p>
      )}
      {config.branding.contactEmail ? (
        <p>
          <a href={`mailto:${config.branding.contactEmail}`}>Contact</a>
        </p>
      ) : null}
      {config.legalLinks.length ? (
        <nav aria-label="Legal information">
          <ul>
            {config.legalLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {renderContribution?.(config) ?? null}
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
    void fetch('/admin/events', {
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
    void fetch(`/admin/events/${encodeURIComponent(selectedEvent)}/modules`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
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
              <p>Details im vollständigen Datensatz öffnen.</p>
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
