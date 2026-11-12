import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner } from '@racepilot/ui';
import type { ExportJob } from '@racepilot/contracts';
import {
  LoadingNotice,
  NoEventSelected,
  RemoteError,
} from '../remote/RemoteNotice.js';
import { errorKindOf } from '../remote/apiRequest.js';
import { useRemoteResource } from '../remote/useRemoteResource.js';
import { ExportForm } from './ExportForm.js';
import { ExportHistory } from './ExportHistory.js';
import { exportsApi } from './exportsApi.js';
import { exportQuery, initialDraft, type ExportDraft } from './exportModel.js';
import { useExportJobs } from './useExportJobs.js';
import './exports.css';

export function AdminExports({ eventId }: { eventId: string }) {
  return eventId ? (
    <ExportsForEvent key={eventId} eventId={eventId} />
  ) : (
    <NoEventSelected />
  );
}

function ExportsForEvent({ eventId }: { eventId: string }) {
  const [draft, setDraft] = useState<ExportDraft>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const loadOptions = useCallback(
    async (signal: AbortSignal) => {
      const [classes, statuses] = await Promise.all([
        exportsApi.classes(eventId, signal),
        exportsApi.statuses(eventId, signal),
      ]);
      return {
        classes: classes.map((item) => ({ key: item.id, label: item.name })),
        statuses,
      };
    },
    [eventId],
  );
  const options = useRemoteResource(loadOptions);
  const jobs = useExportJobs(eventId);
  const classNames = new Map(
    options.state.status === 'ready'
      ? options.state.data.classes.map((item) => [item.key, item.label])
      : [],
  );
  const statusNames = new Map(
    options.state.status === 'ready'
      ? options.state.data.statuses.map((item) => [item.key, item.label])
      : [],
  );

  async function create() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await exportsApi.create(
        eventId,
        exportQuery(draft),
        crypto.randomUUID(),
        request.signal,
      );
      if (!request.signal.aborted) {
        setNotice('Der CSV-Export wurde gestartet. Er erscheint in der Liste.');
        jobs.reload();
      }
    } catch (cause: unknown) {
      if (!request.signal.aborted)
        setError(
          `Export konnte nicht gestartet werden (${errorKindOf(cause)}).`,
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  async function download(job: ExportJob, path: string) {
    setDownloading(job.jobId);
    setError('');
    try {
      await exportsApi.download(path, `nennungen-${eventId}.csv`);
    } catch {
      setError('Die CSV-Datei konnte nicht heruntergeladen werden.');
      jobs.reload();
    } finally {
      setDownloading(null);
    }
  }
  return (
    <div className="exports-view">
      {options.state.status === 'loading' ? (
        <LoadingNotice subject="Die Exportoptionen" />
      ) : options.state.status === 'error' ? (
        <RemoteError
          subject="Die Exportoptionen"
          kind={options.state.kind}
          onRetry={options.reload}
        />
      ) : (
        <ExportForm
          draft={draft}
          onChange={setDraft}
          classes={options.state.data.classes}
          statuses={options.state.data.statuses}
          busy={busy}
          onSubmit={() => void create()}
        />
      )}
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}
      {jobs.state.status === 'loading' ? (
        <LoadingNotice subject="Die Exporte" />
      ) : jobs.state.status === 'error' ? (
        <RemoteError
          subject="Die Exporte"
          kind={jobs.state.kind}
          onRetry={jobs.reload}
        />
      ) : (
        <ExportHistory
          jobs={jobs.state.data}
          classes={classNames}
          statuses={statusNames}
          downloading={downloading}
          onDownload={(job, path) => void download(job, path)}
        />
      )}
    </div>
  );
}
