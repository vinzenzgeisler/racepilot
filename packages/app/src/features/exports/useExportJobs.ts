import { useCallback, useEffect } from 'react';
import { exportsApi } from './exportsApi.js';
import { hasRunningJob } from './exportModel.js';
import { useRemoteResource } from '../remote/useRemoteResource.js';

const POLL_INTERVAL_MS = 2000;

/** The export history of one event. It polls only while a job is still running. */
export function useExportJobs(eventId: string) {
  const load = useCallback(
    (signal: AbortSignal) => exportsApi.list(eventId, signal),
    [eventId],
  );
  const { state, reload } = useRemoteResource(load);
  const running = state.status === 'ready' && hasRunningJob(state.data);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(reload, POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [running, state, reload]);
  return { state, reload };
}
