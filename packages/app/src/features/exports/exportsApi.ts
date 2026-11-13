import { z } from 'zod';
import {
  EventClassSchema,
  ExportJobListSchema,
  ExportJobStatusSchema,
  ExportQueuedSchema,
} from '@racepilot/contracts';
import { adminFetch } from '../../auth.js';
import {
  ApiRequestError,
  apiRequest,
  errorKindFor,
  readJson,
} from '../remote/apiRequest.js';
import { downloadProtectedFile } from '../remote/saveBlob.js';

const event = (eventId: string) =>
  `/admin/events/${encodeURIComponent(eventId)}`;

const WorkflowStatusesSchema = z.object({
  workflow: z.object({
    statuses: z.array(
      z.object({ key: z.string(), labels: z.object({ de: z.string() }) }),
    ),
  }),
});
const ClassListSchema = z.array(
  EventClassSchema.pick({ id: true, name: true }).strip(),
);

export const exportsApi = {
  classes: (eventId: string, signal: AbortSignal) =>
    apiRequest(`${event(eventId)}/classes`, ClassListSchema, { signal }),
  statuses: (eventId: string, signal: AbortSignal) =>
    apiRequest(
      `${event(eventId)}/registration-workflow`,
      WorkflowStatusesSchema,
      {
        signal,
      },
    ).then((body) =>
      body.workflow.statuses.map((status) => ({
        key: status.key,
        label: status.labels.de,
      })),
    ),
  list: (eventId: string, signal: AbortSignal) =>
    apiRequest(`${event(eventId)}/exports`, ExportJobListSchema, { signal }),
  create: async (
    eventId: string,
    query: URLSearchParams,
    idempotencyKey: string,
    signal: AbortSignal,
  ) => {
    const response = await adminFetch(
      `${event(eventId)}/entries.csv?${query}`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      },
    );
    if (response.status === 202) return readJson(response, ExportQueuedSchema);
    throw new ApiRequestError(errorKindFor(response.status));
  },
  status: (jobId: string, signal: AbortSignal) =>
    apiRequest(
      `/admin/artifact-jobs/${encodeURIComponent(jobId)}/status`,
      ExportJobStatusSchema,
      { signal },
    ),
  download: downloadProtectedFile,
};
