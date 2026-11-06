import { useEffect, useState, type ReactNode } from 'react';
import {
  AdminNavigation,
  AdminWorkspace,
  PageHeader,
  PreviewPanel,
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
  detailOpen = false,
  identity,
  onClosePreview,
  activeEvent = '',
  events = [],
  entryCount = 0,
  onEventChange,
}: {
  children: ReactNode | ((view: View) => ReactNode);
  preview?: ReactNode;
  previewOpen?: boolean;
  detailOpen?: boolean;
  identity?: { name: string; role: string } | null;
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
  const closeDate = selectedEvent?.registrationClosesAt
    ? new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin',
      }).format(new Date(selectedEvent.registrationClosesAt))
    : null;
  return (
    <AdminWorkspace
      navigation={
        <AdminNavigation
          brand={<Wordmark variant="on-green" />}
          ariaLabel="Hauptnavigation"
          eventLabel="Veranstaltung"
          eventPlaceholder="Veranstaltung wählen"
          events={events.map((event) => ({ id: event.id, label: event.name }))}
          selectedEvent={activeEvent}
          onEventChange={(id) => onEventChange?.(id)}
          groups={APP_NAVIGATION_REGISTRY.map((group) => ({
            label: group.label,
            items: group.items.map((item) => ({
              ...item,
              ...(item.id === 'entries' ? { count: entryCount } : {}),
            })),
          }))}
          current={view}
          onNavigate={(id) => setView(id as View)}
          user={
            identity ? (
              <span className="nb-user-identity">
                <b aria-hidden="true">
                  {identity.name
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </b>
                <span>
                  <strong>{identity.name}</strong>
                  <small>{identity.role}</small>
                </span>
              </span>
            ) : undefined
          }
        />
      }
      header={
        <PageHeader
          className={view === 'entries' ? 'nb-entry-page-header' : undefined}
          title={
            view === 'entries'
              ? detailOpen
                ? 'Nennung im Detail'
                : 'Nennungen'
              : view === 'workflow'
                ? 'Nennungsablauf'
                : 'Einstellungen'
          }
          description={
            view === 'entries' && closeDate
              ? `Nennungsschluss  ${closeDate.replace(', ', ' · ')}`
              : undefined
          }
        />
      }
      preview={
        view === 'entries' && previewOpen
          ? (preview ?? (
              <PreviewPanel eyebrow="Vorschau" title="Nennung auswählen" />
            ))
          : undefined
      }
      previewLabel="Nennungsvorschau"
      mobilePreviewOpen={view === 'entries' && previewOpen && Boolean(preview)}
    >
      {typeof children === 'function' ? children(view) : children}
    </AdminWorkspace>
  );
}
