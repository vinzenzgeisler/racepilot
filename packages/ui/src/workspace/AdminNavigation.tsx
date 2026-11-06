import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icon/Icon.js';

type NavItem = { id: string; label: string; icon: IconName; count?: number };
export type NavGroup = { label: string; items: NavItem[] };
export type EventChoice = { id: string; label: string };
export function AdminNavigation({
  brand,
  eventLabel,
  eventPlaceholder,
  events,
  selectedEvent,
  onEventChange,
  groups,
  current,
  onNavigate,
  user,
  ariaLabel,
  compact = false,
}: {
  brand: ReactNode;
  eventLabel: string;
  eventPlaceholder: string;
  events: EventChoice[];
  selectedEvent: string;
  onEventChange: (id: string) => void;
  groups: NavGroup[];
  current: string;
  onNavigate: (id: string) => void;
  user?: ReactNode;
  ariaLabel: string;
  compact?: boolean;
}) {
  const items = groups.flatMap((group) => group.items);
  const item = (entry: NavItem) => (
    <button
      key={entry.id}
      type="button"
      className={`nb-admin-nav-item${current === entry.id ? ' is-current' : ''}`}
      aria-current={current === entry.id ? 'page' : undefined}
      aria-label={entry.label}
      onClick={() => onNavigate(entry.id)}
    >
      <Icon name={entry.icon} />
      <span className="nb-admin-nav-label">{entry.label}</span>
      {entry.count !== undefined && (
        <span className="nb-admin-nav-count">{entry.count}</span>
      )}
    </button>
  );
  return (
    <>
      <aside
        className={`nb-admin-nav${compact ? ' is-compact' : ''}`}
        aria-label={ariaLabel}
      >
        <div className="nb-admin-nav-top">
          <div className="nb-admin-nav-brand">{brand}</div>
          <label className="nb-admin-event-picker">
            <span className="nb-visually-hidden">{eventLabel}</span>
            <select
              value={selectedEvent}
              onChange={(event) => onEventChange(event.target.value)}
            >
              <option value="">{eventPlaceholder}</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav>
          {groups.map((group) => (
            <section
              key={group.label}
              aria-label={group.label}
              className="nb-admin-nav-group"
            >
              <h2>{group.label}</h2>
              {group.items.map(item)}
            </section>
          ))}
        </nav>
        {user && <div className="nb-admin-nav-user">{user}</div>}
      </aside>
      <nav className="nb-admin-mobile-nav" aria-label={ariaLabel}>
        {items.map(item)}
      </nav>
    </>
  );
}
