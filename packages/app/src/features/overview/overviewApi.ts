import { EventOverviewSchema } from '@racepilot/contracts';
import { apiRequest } from '../remote/apiRequest.js';

export const overviewApi = {
  load: (eventId: string, signal: AbortSignal) =>
    apiRequest(
      `/admin/events/${encodeURIComponent(eventId)}/overview`,
      EventOverviewSchema,
      { signal },
    ),
};
