import type { ExportJob } from '@racepilot/contracts';
import { Button, DataTable, DetailSection, StatusLabel } from '@racepilot/ui';
import {
  describeFilters,
  formatDateTime,
  safeDownloadPath,
  STATE_LABELS,
  STATE_MEANING,
} from './exportModel.js';

export function ExportHistory({
  jobs,
  classes,
  statuses,
  downloading,
  onDownload,
}: {
  jobs: ExportJob[];
  classes: Map<string, string>;
  statuses: Map<string, string>;
  downloading: string | null;
  onDownload: (job: ExportJob, path: string) => void;
}) {
  return (
    <DetailSection title="Bisherige Exporte">
      {jobs.length === 0 ? (
        <p>Noch keine Exporte für diese Veranstaltung.</p>
      ) : (
        <DataTable headers={['Erstellt', 'Filter', 'Status', 'Datei']} compact>
          {jobs.map((job) => {
            const path = safeDownloadPath(job.downloadUrl);
            return (
              <tr key={job.jobId}>
                <td>{formatDateTime(job.createdAt)}</td>
                <td>{describeFilters(job.filters, { classes, statuses })}</td>
                <td>
                  <StatusLabel
                    status={STATE_MEANING[job.status]}
                    label={STATE_LABELS[job.status]}
                  />
                </td>
                <td>
                  {job.status === 'finished' && path ? (
                    <Button
                      variant="secondary"
                      disabled={downloading === job.jobId}
                      onClick={() => onDownload(job, path)}
                    >
                      CSV herunterladen
                    </Button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </DetailSection>
  );
}
