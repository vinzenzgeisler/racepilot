import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Icon,
  PageHeader,
  SelectField,
  type IconName,
} from '@racepilot/ui';

export type ShellModule = {
  id: string;
  displayName: string;
  source: 'core' | 'official' | 'private';
  enabled: boolean;
  navigationLabel?: string;
};

type EventOption = { id: string; name: string };
type View = 'entries' | 'modules' | 'onsite' | 'account';
type NavItem = { id: View; label: string; icon: IconName; count?: string };
type NavGroup = { label: string; items: NavItem[] };

export const APP_NAVIGATION_REGISTRY: NavGroup[] = [
  {
    label: 'Veranstaltung',
    items: [{ id: 'entries', label: 'Nennungen', icon: 'list' }],
  },
  {
    label: 'Vor Ort',
    items: [{ id: 'onsite', label: 'Rennbetrieb', icon: 'approval' }],
  },
  {
    label: 'Konto',
    items: [{ id: 'account', label: 'Einstellungen', icon: 'more' }],
  },
];

export function AppShell({
  children,
  preview,
  previewOpen = true,
  onClosePreview,
  activeEvent = '',
  events = [],
  modules = [],
  onEventChange,
}: {
  children: ReactNode | ((view: View) => ReactNode);
  preview?: ReactNode;
  previewOpen?: boolean;
  onClosePreview?: () => void;
  activeEvent?: string;
  events?: EventOption[];
  modules?: ShellModule[];
  onEventChange?: (id: string) => void;
}) {
  const [view, setView] = useState<View>('entries');
  const [mode, setMode] = useState<'Verwaltung' | 'Rennbetrieb'>('Verwaltung');

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !previewOpen) return;
      onClosePreview?.();
      document
        .querySelector<HTMLButtonElement>('[data-selected-entry]')
        ?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClosePreview, previewOpen]);
  const enabledModules = useMemo(
    () => modules.filter((module) => module.enabled),
    [modules],
  );
  const privateModules = enabledModules.filter(
    (module) => module.source === 'private',
  );
  const registeredModules = enabledModules.filter(
    (module) => module.source !== 'private',
  );
  const chooseEvent = (id: string) => onEventChange?.(id);
  const navigate = (next: View) => {
    setView(next);
    if (next === 'onsite') setMode('Rennbetrieb');
  };
  const item = (entry: NavItem) => (
    <Button
      key={`${entry.id}-${entry.label}`}
      variant="text"
      size={40}
      className={`app-nav-item${view === entry.id ? ' is-current' : ''}`}
      aria-current={view === entry.id ? 'page' : undefined}
      aria-label={entry.label}
      title={entry.label}
      onClick={() => navigate(entry.id)}
    >
      <span className="app-nav-icon" aria-hidden="true">
        <Icon name={entry.icon} />
      </span>
      <span className="app-nav-label">{entry.label}</span>
      {entry.count && <span className="app-nav-count">{entry.count}</span>}
    </Button>
  );
  const title =
    view === 'entries'
      ? 'Nennungen'
      : view === 'modules'
        ? 'Module'
        : view === 'onsite'
          ? 'Rennbetrieb'
          : 'Einstellungen';
  return (
    <div
      className={`app-shell${mode === 'Rennbetrieb' ? ' is-race-mode' : ''}`}
    >
      <aside className="app-sidebar" aria-label="Hauptnavigation">
        <div className="app-event-picker">
          <SelectField
            id="app-event"
            label="Veranstaltung"
            value={activeEvent}
            onChange={(event) => chooseEvent(event.target.value)}
          >
            <option value="">Veranstaltung wählen</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </SelectField>
        </div>
        <nav className="app-sidebar-nav">
          {APP_NAVIGATION_REGISTRY.slice(0, 2).map((group) => (
            <section
              className="app-nav-group"
              key={group.label}
              aria-label={group.label}
            >
              <h2>{group.label}</h2>
              {group.items.map(item)}
            </section>
          ))}
          {registeredModules.length > 0 && (
            <section className="app-nav-group" aria-label="Module">
              <h2>Module</h2>
              {registeredModules.map((module) =>
                item({
                  id: 'modules',
                  label: module.navigationLabel ?? module.displayName,
                  icon: 'document',
                }),
              )}
            </section>
          )}
          {privateModules.length > 0 && (
            <section
              className="app-nav-group"
              aria-label="Module · individuell"
            >
              <h2>Module · individuell</h2>
              {privateModules.map((module) =>
                item({
                  id: 'modules',
                  label: module.navigationLabel ?? module.displayName,
                  icon: 'document',
                }),
              )}
            </section>
          )}
        </nav>
        <Button
          variant="text"
          size={40}
          className="app-account"
          aria-current={view === 'account' ? 'page' : undefined}
          onClick={() => navigate('account')}
        >
          <span className="app-nav-icon" aria-hidden="true">
            <Icon name="more" />
          </span>
          <span className="app-nav-label">Konto · Einstellungen</span>
        </Button>
      </aside>
      <div className="app-workspace">
        <PageHeader
          className="app-header"
          title={title}
          actions={
            <div className="app-header-actions">
              <div
                className="app-view-switch"
                role="group"
                aria-label="Ansicht"
              >
                <Button
                  variant="text"
                  size={40}
                  aria-pressed={mode === 'Verwaltung'}
                  onClick={() => {
                    setMode('Verwaltung');
                    setView('entries');
                  }}
                >
                  Verwaltung
                </Button>
                <Button
                  variant="text"
                  size={40}
                  aria-pressed={mode === 'Rennbetrieb'}
                  onClick={() => {
                    setMode('Rennbetrieb');
                    setView('onsite');
                  }}
                >
                  Rennbetrieb
                </Button>
              </div>
              {(view === 'entries' || view === 'modules') && (
                <Button
                  variant="primary"
                  size={40}
                  onClick={() =>
                    document
                      .querySelector<HTMLInputElement>(
                        '.admin-filters input, section[aria-labelledby="modules-title"] input',
                      )
                      ?.focus()
                  }
                >
                  {view === 'entries' ? 'Startnummer suchen' : 'Modul suchen'}
                </Button>
              )}
            </div>
          }
        />
        <main className="app-main">
          <div className="app-main-content">
            {typeof children === 'function' ? children(view) : children}
          </div>
          {view === 'entries' && previewOpen && (
            <aside className="app-preview" aria-label="Nennungsvorschau">
              <Button
                variant="text"
                className="app-preview-close"
                aria-label="Vorschau schließen"
                onClick={onClosePreview}
              >
                Schließen
              </Button>
              {preview ?? (
                <>
                  <p className="app-eyebrow">VORSCHAU</p>
                  <h2>Nennung auswählen</h2>
                  <p>
                    Wähle eine Zeile, um Status, Unterlagen und nächste Aktion
                    hier zu sehen.
                  </p>
                </>
              )}
            </aside>
          )}
        </main>
      </div>
      <nav className="app-bottom-nav" aria-label="Hauptnavigation mobil">
        {APP_NAVIGATION_REGISTRY.slice(0, 2)
          .flatMap((group) => group.items)
          .map(item)}
        {item({ id: 'account', label: 'Einstellungen', icon: 'more' })}
      </nav>
    </div>
  );
}
