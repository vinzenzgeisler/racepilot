import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type {
  MessageCampaignRecord,
  MessageRecipientFilter,
  MessageRecipientPreview,
  MessageRenderedPreview,
  MessageTemplateRecord,
} from '@racepilot/contracts';
import { EventClassSchema } from '@racepilot/contracts';
import { z } from 'zod';
import { MessageApiError, messagesApi } from './messagesApi.js';

type Data<T> = { value: T; loading: boolean; error: string };
function useRequest<T>(
  eventId: string,
  key: string,
  initial: T,
  load: (signal: AbortSignal) => Promise<T>,
): Data<T> {
  const requestKey = `${eventId}:${key}`;
  const [data, setData] = useState<{ key: string; value: T; error: string }>({
    key: '',
    value: initial,
    error: '',
  });
  const generation = useRef(0);
  const loadCurrent = useEffectEvent(load);
  const failCurrent = useEffectEvent((error: unknown) => {
    setData({
      key: requestKey,
      value: initial,
      error:
        error instanceof MessageApiError
          ? `${error.message}${error.details.length ? `: ${error.details.join(', ')}` : ''}`
          : 'Die Daten konnten nicht geladen werden.',
    });
  });
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    if (eventId)
      void loadCurrent(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted && generation.current === current)
            setData({ key: requestKey, value, error: '' });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && generation.current === current)
            failCurrent(error);
        });
    return () => {
      controller.abort();
      generation.current = current + 1;
    };
  }, [eventId, requestKey]);
  return data.key === requestKey
    ? { value: data.value, loading: false, error: data.error }
    : { value: initial, loading: Boolean(eventId), error: '' };
}
const emptyRecipients: MessageRecipientPreview = { count: 0, recipients: [] };
export function useMessagesData(
  eventId: string,
  recipients: MessageRecipientFilter,
  subject: string,
  text: string,
  revision: number,
) {
  const filterKey = JSON.stringify(recipients);
  const candidates = useRequest(
    eventId,
    JSON.stringify({ ...recipients, entryIds: [] }),
    emptyRecipients,
    (signal) =>
      messagesApi.recipients(eventId, { ...recipients, entryIds: [] }, signal),
  );
  const selection = useRequest(eventId, filterKey, emptyRecipients, (signal) =>
    messagesApi.recipients(eventId, recipients, signal),
  );
  const classes = useRequest<z.infer<typeof EventClassSchema>[]>(
    eventId,
    'classes',
    [],
    (signal) => messagesApi.classes(eventId, signal),
  );
  const templates = useRequest<MessageTemplateRecord[]>(
    eventId,
    'templates',
    [],
    (signal) => messagesApi.templates(eventId, signal),
  );
  const campaigns = useRequest<MessageCampaignRecord[]>(
    eventId,
    String(revision),
    [],
    (signal) => messagesApi.campaigns(eventId, signal),
  );
  const rendered = useRequest<MessageRenderedPreview | null>(
    eventId,
    `${filterKey}:${subject}:${text}:${selection.value.count}`,
    null,
    (signal) =>
      subject.trim() && text.trim() && selection.value.count > 0
        ? messagesApi.render(eventId, recipients, subject, text, signal)
        : Promise.resolve(null),
  );
  return { candidates, selection, classes, templates, campaigns, rendered };
}
