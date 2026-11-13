import { useEffect, useState, type ReactNode } from 'react';
import {
  AdminNavigation,
  AdminWorkspace,
  PageHeader,
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
type View =
  | 'overview'
  | 'entries'
  | 'workflow'
  | 'setup'
  | 'account'
  | 'exports'
  | 'messages';
const VIEW_TITLES: Record<View, string> = {
  overview: 'Übersicht',
  exports: 'Exporte',
  entries: 'Nennungen',
  workflow: 'Nennungsablauf',
  setup: 'Veranstaltung einrichten',
  account: 'Einstellungen',
  messages: 'Nachrichten',
};
type NavItem = {
  id: View;
  label: string;
  icon: IconName;
  mobile?: boolean;
  mobileLabel?: string;
};
export const APP_NAVIGATION_REGISTRY: Array<{
  label: string;
  items: NavItem[];
}> = [
  {
    label: 'Veranstaltung',
    items: [
      {
        id: 'overview',
        label: 'Übersicht',
        mobileLabel: 'Start',
        icon: 'overview',
      },
      { id: 'entries', label: 'Nennungen', icon: 'list' },
      {
        id: 'setup',
        label: 'Einrichten',
        mobileLabel: 'Event',
        icon: 'calendar',
      },
    ],
  },
  {
    label: 'Kommunikation',
    items: [
      {
        id: 'messages',
        label: 'Nachrichten',
        mobileLabel: 'Post',
        icon: 'mail',
      },
    ],
  },
  {
    label: 'Konto',
    items: [
      { id: 'exports', label: 'Exporte', icon: 'export' },
      {
        id: 'account',
        label: 'Einstellungen',
        mobileLabel: 'Konto',
        icon: 'more',
      },
      {
        id: 'workflow',
        label: 'Nennungsablauf',
        icon: 'approval',
        mobile: false,
      },
    ],
  },
];
export function AppShell({
  children,
  previewOpen = true,
  detailOpen = false,
  identity,
  onClosePreview,
  activeEvent = '',
  events = [],
  entryCount = 0,
  onEventChange,
  messageEntryId,
  onClearMessageSelection,
  entriesNavigationRevision,
}: {
  children: ReactNode | ((view: View) => ReactNode);
  previewOpen?: boolean;
  detailOpen?: boolean;
  identity?: { name: string; role: string } | null;
  onClosePreview?: () => void;
  activeEvent?: string;
  events?: EventOption[];
  entryCount?: number;
  onEventChange?: (id: string) => void;
  messageEntryId?: string | null;
  onClearMessageSelection?: () => void;
  entriesNavigationRevision?: number;
}) {
  const [selection, setSelection] = useState<{ view: View; revision: number }>({
    view: 'entries',
    revision: 0,
  });
  const view =
    (entriesNavigationRevision ?? 0) > selection.revision
      ? 'entries'
      : selection.view;
  const currentView = messageEntryId && view === 'entries' ? 'messages' : view;
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
          current={currentView}
          onNavigate={(id) => {
            onClearMessageSelection?.();
            const item = APP_NAVIGATION_REGISTRY.flatMap(
              (group) => group.items,
            ).find((entry) => entry.id === id);
            if (item)
              setSelection({
                view: item.id,
                revision: entriesNavigationRevision ?? 0,
              });
          }}
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
        detailOpen && currentView === 'entries' ? null : (
          <PageHeader
            className={
              currentView === 'entries' ? 'nb-entry-page-header' : undefined
            }
            title={VIEW_TITLES[currentView]}
            description={
              currentView === 'entries' && closeDate
                ? `Nennungsschluss  ${closeDate.replace(', ', ' · ')}`
                : undefined
            }
          />
        )
      }
      inset={currentView !== 'entries'}
    >
      {typeof children === 'function' ? children(currentView) : children}
    </AdminWorkspace>
  );
}
