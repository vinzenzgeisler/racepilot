import { useCallback } from 'react';
import { EmptyState } from '@racepilot/ui';
import {
  LoadingNotice,
  NoEventSelected,
  RemoteError,
} from '../remote/RemoteNotice.js';
import { useRemoteResource } from '../remote/useRemoteResource.js';
import { OverviewClasses } from './OverviewClasses.js';
import { OverviewMetrics } from './OverviewMetrics.js';
import { OverviewStatuses } from './OverviewStatuses.js';
import { OverviewWarnings } from './OverviewWarnings.js';
import { overviewApi } from './overviewApi.js';
import { totalEntries, type EntryFilters } from './overviewModel.js';
import './overview.css';

type Props = {
  eventId: string;
  onOpenEntries: (filters: EntryFilters) => void;
};

/** Key figures of the selected event; keyed by event so nothing carries over. */
export function AdminOverview({ eventId, onOpenEntries }: Props) {
  return eventId ? (
    <OverviewForEvent
      key={eventId}
      eventId={eventId}
      onOpenEntries={onOpenEntries}
    />
  ) : (
    <NoEventSelected />
  );
}

function OverviewForEvent({ eventId, onOpenEntries }: Props) {
  const load = useCallback(
    (signal: AbortSignal) => overviewApi.load(eventId, signal),
    [eventId],
  );
  const { state, reload } = useRemoteResource(load);
  if (state.status === 'loading')
    return <LoadingNotice subject="Die Übersicht" />;
  if (state.status === 'error')
    return (
      <RemoteError subject="Die Übersicht" kind={state.kind} onRetry={reload} />
    );
  const overview = state.data;
  const hasContent =
    totalEntries(overview.statuses) > 0 || overview.classes.length > 0;
  if (!hasContent)
    return (
      <EmptyState
        title="Noch keine Nennungen"
        description="Sobald die ersten Nennungen eingehen, erscheinen hier Kennzahlen, Belegung und Hinweise."
      />
    );
  return (
    <div className="overview">
      <OverviewWarnings
        eventId={eventId}
        warnings={overview.warnings}
        onOpenEntries={onOpenEntries}
      />
      <OverviewMetrics overview={overview} />
      <div className="overview-columns">
        <OverviewStatuses statuses={overview.statuses} />
        <OverviewClasses classes={overview.classes} />
      </div>
    </div>
  );
}
