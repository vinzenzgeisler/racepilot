import { describe, expect, it, vi } from 'vitest';
import { createRequestContext, organizationId } from '@racepilot/core';
import type { ObjectStorageProvider } from '@racepilot/core';
import type { ApiDeps } from './types.js';
import { createApp } from './index.js';
import { testDeps } from './testing.js';

const orgId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';
const context = createRequestContext({
  deploymentMode: 'community',
  organizationId: organizationId(orgId),
  permissions: new Set(['entry:read', 'event:write']),
  capabilities: new Set(),
  correlationId: 'test-correlation',
});

function appFor(permissions = context.permissions) {
  const member = { ...context, permissions };
  const calls: Array<{
    eventId: string;
    key: string;
    actor: string;
    organizationId: string;
  }> = [];
  const sendImplementation: NonNullable<ApiDeps['messages']>['send'] = async (
    requestContext,
    requestEventId,
    key,
    input,
    actor,
  ) => {
    calls.push({
      eventId: requestEventId,
      key,
      actor,
      organizationId: requestContext.organizationId,
    });
    return {
      ok: true,
      campaign: {
        campaign: {
          id: `campaign-${input.eventId}`,
          eventId: input.eventId,
          subject: input.subject,
          status: 'sending',
          createdAt: new Date(),
        },
        recipients: [],
      },
    };
  };
  const send = vi.fn(sendImplementation);
  const messages: NonNullable<ApiDeps['messages']> = {
    preview: async () => ({
      ok: true as const,
      value: { count: 0, recipients: [] },
    }),
    send,
    retryFailed: async () => null,
    list: async () => [],
    listTemplates: async () => [],
    saveTemplate: async () => null,
    previewTemplate: async () => ({
      ok: false as const,
      error: { code: 'no-recipients' as const, message: 'No recipients' },
    }),
    quickAction: async () => ({
      ok: false,
      error: { code: 'no-recipients', message: 'No matching recipients' },
    }),
  };
  const objectStorage: ObjectStorageProvider = {
    put: async ({ organizationId: tenantId, body, contentType }) => ({
      organizationId: tenantId,
      objectId: '00000000-0000-4000-8000-000000000003',
      contentType,
      size: body.length,
      sha256: 'a'.repeat(64),
    }),
    head: async () => null,
    get: async () => null,
    delete: async () => {},
  };
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'community', organizationId: orgId },
      organizations: { getById: async () => null, update: async () => null },
      events: {
        listByOrganization: async () => [],
        getById: async () => ({
          id: eventId,
          organizationId: context.organizationId,
          slug: 'event',
          name: 'Event',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
          status: 'open',
          registrationOpensAt: null,
          registrationClosesAt: null,
          openedAt: null,
          closedAt: null,
          archivedAt: null,
        }),
      },
      messages,
      objectStorage,
      contextResolvers: {
        public: async () => null,
        member: async () => member,
      },
    }),
  );
  return { app, send, calls };
}

describe('message campaign routes', () => {
  it('requires entry read permission for recipient preview', async () => {
    const { app } = appFor(new Set());
    const response = await app.request(
      `/admin/events/${eventId}/messages/recipients/preview`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(response.status).toBe(403);
  });

  it('stores valid PDF attachments and rejects non-PDF bytes', async () => {
    const { app } = appFor();
    const response = await app.request(
      `/admin/events/${eventId}/messages/attachments`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: 'regulations.pdf',
          contentType: 'application/pdf',
          contentBase64: Buffer.from('%PDF-1.7\nfixture').toString('base64'),
        }),
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      filename: 'regulations.pdf',
      contentType: 'application/pdf',
    });
    const invalid = await app.request(
      `/admin/events/${eventId}/messages/attachments`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: 'fake.pdf',
          contentType: 'application/pdf',
          contentBase64: Buffer.from('not a PDF').toString('base64'),
        }),
      },
    );
    expect(invalid.status).toBe(400);
  });

  it('validates and forwards idempotent campaign submission', async () => {
    const { app, send, calls } = appFor();
    const response = await app.request(
      `/admin/events/${eventId}/messages/campaigns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'test-key-001',
        },
        body: JSON.stringify({
          eventId,
          recipients: {},
          subject: 'Hi {{firstName}}',
          text: 'Hello',
          attachments: [],
        }),
      },
    );
    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledOnce();
    expect(calls[0]).toMatchObject({
      eventId,
      key: 'test-key-001',
      organizationId: orgId,
    });
  });

  it('maps idempotency conflicts to 409 and validation failures to 422', async () => {
    const { app, send } = appFor();
    const request = (key: string) =>
      app.request(`/admin/events/${eventId}/messages/campaigns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          eventId,
          recipients: {},
          subject: 'Hi',
          text: 'Body',
          attachments: [],
        }),
      });
    send.mockResolvedValueOnce({
      ok: false,
      error: { code: 'idempotency-conflict', message: 'Key reused' },
    });
    const conflict = await request('conflict-001');
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: 'idempotency-conflict',
    });
    send.mockResolvedValueOnce({
      ok: false,
      error: { code: 'no-recipients', message: 'No recipients' },
    });
    const invalid = await request('invalid-001');
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ code: 'no-recipients' });
  });
});
