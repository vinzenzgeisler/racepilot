import { z } from 'zod';
import {
  EventClassSchema,
  MessageAttachmentRecordSchema,
  MessageCampaignRecordSchema,
  MessageErrorSchema,
  MessageRecipientPreviewSchema,
  MessageRenderedPreviewSchema,
  MessageTemplateRecordSchema,
  type MessageCampaignCreate,
  type MessageRecipientFilter,
} from '@racepilot/contracts';
import { adminFetch } from '../../auth.js';

export class MessageApiError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

async function call<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  const response = await adminFetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = MessageErrorSchema.safeParse(payload);
    throw new MessageApiError(
      error.success ? error.data.error : 'Die Anfrage ist fehlgeschlagen.',
      error.success ? (error.data.details ?? []) : [],
    );
  }
  return schema.parse(payload);
}
const endpoint = (eventId: string) =>
  `/admin/events/${encodeURIComponent(eventId)}/messages`;
const post = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
  ...(signal ? { signal } : {}),
});
export const messagesApi = {
  classes: (eventId: string, signal: AbortSignal) =>
    call(
      `/admin/events/${encodeURIComponent(eventId)}/classes`,
      z.array(EventClassSchema.passthrough()),
      { signal },
    ),
  recipients: (
    eventId: string,
    filter: MessageRecipientFilter,
    signal: AbortSignal,
  ) =>
    call(
      `${endpoint(eventId)}/recipients/preview`,
      MessageRecipientPreviewSchema,
      post(filter, signal),
    ),
  templates: (eventId: string, signal: AbortSignal) =>
    call(
      `${endpoint(eventId)}/templates`,
      z.object({ items: z.array(MessageTemplateRecordSchema) }),
      { signal },
    ).then((value) => value.items),
  render: (
    eventId: string,
    recipients: MessageRecipientFilter,
    subject: string,
    text: string,
    signal: AbortSignal,
  ) =>
    call(
      `${endpoint(eventId)}/templates/preview`,
      MessageRenderedPreviewSchema,
      post({ recipients, subject, text }, signal),
    ),
  campaigns: (eventId: string, signal: AbortSignal) =>
    call(
      `${endpoint(eventId)}/campaigns`,
      z.object({ items: z.array(MessageCampaignRecordSchema) }),
      { signal },
    ).then((value) => value.items),
  send: (eventId: string, body: MessageCampaignCreate, key: string) =>
    call(`${endpoint(eventId)}/campaigns`, MessageCampaignRecordSchema, {
      ...post(body),
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    }),
  quickAction: (
    eventId: string,
    action: 'resend-verification' | 'remind-open-payments',
  ) =>
    call(
      `${endpoint(eventId)}/actions/${action}`,
      MessageCampaignRecordSchema,
      { method: 'POST' },
    ),
  retry: (campaignId: string) =>
    call(
      `/admin/message-campaigns/${encodeURIComponent(campaignId)}/retry`,
      MessageCampaignRecordSchema,
      { method: 'POST' },
    ),
  upload: (eventId: string, filename: string, contentBase64: string) =>
    call(
      `${endpoint(eventId)}/attachments`,
      MessageAttachmentRecordSchema,
      post({ filename, contentType: 'application/pdf', contentBase64 }),
    ),
};
