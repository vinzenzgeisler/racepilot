import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Icon,
  PageHeader,
  SelectField,
  Wordmark,
  type IconName,
} from '@racepilot/ui';

export type ShellModule = {
  id: string;
  displayName: string;
  source: 'core' | 'official' | 'private';
  enabled: boolean;
  navigationLabel?: string;
};
type EventOption = {
  id: string;
  name: string;
  slug?: string;
  registrationClosesAt?: string | null;
};
type View = 'entries' | 'workflow' | 'account';
type NavItem = { id: View; label: string; icon: IconName };
export const APP_NAVIGATION_REGISTRY: Array<{
  label: string;
  items: NavItem[];
}> = [
  {
    label: 'Veranstaltung',
    items: [
      { id: 'entries', label: 'Nennungen', icon: 'list' },
      { id: 'workflow', label: 'Nennungsablauf', icon: 'approval' },
    ],
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
  entryCount = 0,
  onEventChange,
}: {
  children: ReactNode | ((view: View) => ReactNode);
  preview?: ReactNode;
  previewOpen?: boolean;
  onClosePreview?: () => void;
  activeEvent?: string;
  events?: EventOption[];
  entryCount?: number;
  onEventChange?: (id: string) => void;
}) {
  const [view, setView] = useState<View>('entries');
  const selectedEvent = events.find((event) => event.id === activeEvent);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && previewOpen) {
        onClosePreview?.();
        document
          .querySelector<HTMLButtonElement>('[data-selected-entry]')
          ?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClosePreview, previewOpen]);
  const item = (entry: NavItem) => (
    <Button
      key={entry.id}
      variant="text"
      size={40}
      className={`app-nav-item${view === entry.id ? ' is-current' : ''}`}
      aria-current={view === entry.id ? 'page' : undefined}
      aria-label={entry.label}
      onClick={() => setView(entry.id)}
    >
      <span className="app-nav-icon" aria-hidden="true">
        <Icon name={entry.icon} />
      </span>
      <span className="app-nav-label">{entry.label}</span>
      {entry.id === 'entries' && (
        <span className="app-nav-count">{entryCount}</span>
      )}
    </Button>
  );
  const closeDate = selectedEvent?.registrationClosesAt
    ? new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Berlin',
      }).format(new Date(selectedEvent.registrationClosesAt))
    : null;
  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Hauptnavigation">
        <div className="app-event-picker">
          <Wordmark variant="on-green" className="app-logo" />
          <SelectField
            id="app-event"
            label="Veranstaltung"
            value={activeEvent}
            onChange={(event) => onEventChange?.(event.target.value)}
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
          {APP_NAVIGATION_REGISTRY.slice(0, 1).map((group) => (
            <section
              className="app-nav-group"
              key={group.label}
              aria-label={group.label}
            >
              <h2>{group.label}</h2>
              {group.items.map(item)}
            </section>
          ))}
        </nav>
        <div className="app-account">
          {item(APP_NAVIGATION_REGISTRY[1]!.items[0]!)}
        </div>
      </aside>
      <div className="app-workspace">
        <PageHeader
          className="app-header"
          title={
            view === 'entries'
              ? 'Nennungen'
              : view === 'workflow'
                ? 'Nennungsablauf'
                : 'Einstellungen'
          }
          description={
            view === 'entries' && closeDate
              ? `Nennungsschluss: ${closeDate}`
              : undefined
          }
          actions={
            view === 'entries' && selectedEvent?.slug ? (
              <a
                className="nb-button nb-button-primary app-create-entry"
                href={`/events/${encodeURIComponent(selectedEvent.slug)}/register`}
              >
                Nennung anlegen ↗
              </a>
            ) : undefined
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
                ×
              </Button>
              {preview ?? (
                <>
                  <p className="app-eyebrow">Vorschau</p>
                  <p>Nennung auswählen</p>
                </>
              )}
            </aside>
          )}
        </main>
      </div>
      <nav className="app-bottom-nav" aria-label="Hauptnavigation mobil">
        {APP_NAVIGATION_REGISTRY.flatMap((group) => group.items).map(item)}
      </nav>
    </div>
  );
}
