import { staticCanonicalOrigin } from '@racepilot/core';
import { describe, expect, it, vi } from 'vitest';
import {
  createMailOutboxTask,
  processMailOutboxJob,
  renderMailTemplate,
  defaultMailTemplate,
  type MailOutboxRepository,
  type MailOutboxRecord,
} from './mail.js';
import { organizationId } from '@racepilot/core';
import type {
  JobContext,
  MailAttachment,
  ObjectStorageProvider,
} from '@racepilot/core';
const ctx: JobContext = {
  deploymentMode: 'cloud',
  organizationId: organizationId('org-a'),
  jobId: 'job',
  correlationId: 'corr',
};
function setup(tenantId = 'org-a') {
  const row: MailOutboxRecord = {
    id: 'mail-1',
    organizationId: tenantId,
    eventId: null,
    templateKey: 'verification',
    templateVersion: 1,
    locale: 'en',
    recipient: 'person@example.test',
    idempotencyKey: 'key',
    variables: {
      recipientName: '<Sam>',
      verificationUrl: 'https://example.test/verify',
    },
    status: 'pending',
    attempts: 0,
  };
  let status: MailOutboxRecord['status'] = 'pending';
  let attempts = 0;
  let claims = 0;
  const deliveries: unknown[] = [];
  const repo: MailOutboxRepository = {
    get: async () => ({
      ...row,
      status,
      attempts,
    }),
    claim: async () => {
      if (status !== 'pending') return null;
      status = 'sending';
      claims++;
      return { ...row, status: 'sending', attempts };
    },
    template: async () => null,
    organizationMailConfig: async () => ({
      from: 'org@example.test',
      replyTo: null,
    }),
    finish: async (_ctx, _id, result) => {
      status =
        result.outcome === 'sent'
          ? 'sent'
          : result.outcome === 'failed'
            ? 'failed'
            : 'pending';
      attempts = result.attempts;
      deliveries.push(result);
    },
  };
  const mail = { send: vi.fn(async () => {}) };
  return {
    repo,
    repository: repo,
    mail,
    state: () => ({ status, attempts, claims, deliveries }),
  };
}
describe('mail outbox worker', () => {
  it('provides a complete escaped registration-resume template in both supported locales', () => {
    for (const locale of ['de', 'en'] satisfies ReadonlyArray<'de' | 'en'>) {
      const rendered = renderMailTemplate(
        defaultMailTemplate('registration-resume', locale),
        'registration-resume',
        {
          recipientName: '<Sam>',
          resumeUrl: 'https://example.test/registration/resume#token=opaque',
        },
      );
      expect(rendered.subject).toBeTruthy();
      expect(rendered.html).toContain('&lt;Sam&gt;');
      expect(rendered.html).toContain('registration/resume#token=opaque');
    }
  });
  it('renders the latest driver note placeholder in status-change mail', () => {
    const rendered = renderMailTemplate(
      defaultMailTemplate('status-change', 'de'),
      'status-change',
      {
        recipientName: 'Sam',
        eventName: 'Bergpreis',
        statusKey: 'accepted',
        statusLabelDe: 'Angenommen',
        statusLabelEn: 'Accepted',
        driverNote: 'Bitte Unterlagen mitbringen',
      },
    );
    expect(rendered.text).toContain('Bitte Unterlagen mitbringen');
  });
  it('escapes HTML values and rejects unknown placeholders', () => {
    expect(
      renderMailTemplate(
        {
          subject: '{{recipientName}}',
          text: '{{recipientName}}',
          html: '{{recipientName}}',
        },
        'verification',
        { recipientName: '<x>', verificationUrl: 'url' },
      ).html,
    ).toBe('&lt;x&gt;');
    expect(() =>
      renderMailTemplate(
        { subject: '{{foreign}}', text: '', html: '' },
        'verification',
        { recipientName: 'x', verificationUrl: 'u' },
      ),
    ).toThrow('Unknown');
  });
  it('retries with exponential backoff and marks final failure', async () => {
    const h = setup();
    h.mail.send = vi.fn().mockRejectedValue(new Error('smtp unavailable'));
    await processMailOutboxJob({
      ctx,
      outboxId: 'mail-1',
      deps: { ...h, now: () => new Date(0), maxAttempts: 2 },
    });
    await processMailOutboxJob({
      ctx,
      outboxId: 'mail-1',
      deps: { ...h, now: () => new Date(30_000), maxAttempts: 2 },
    });
    expect(h.state().status).toBe('failed');
    expect(h.state().deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: 'retry',
          availableAt: new Date(30_000),
        }),
        expect.objectContaining({ outcome: 'failed' }),
      ]),
    );
  });
  it('a duplicate execution does not send again after delivery', async () => {
    const h = setup();
    await processMailOutboxJob({ ctx, outboxId: 'mail-1', deps: h });
    await processMailOutboxJob({ ctx, outboxId: 'mail-1', deps: h });
    expect(h.mail.send).toHaveBeenCalledTimes(1);
  });
  it('ends malformed and foreign community envelopes without Graphile retries', async () => {
    const organizationA = '11111111-1111-4111-8111-111111111111';
    const organizationB = '22222222-2222-4222-8222-222222222222';
    const h = setup();
    const task = createMailOutboxTask({
      deploymentMode: 'community',
      communityOrganizationId: organizationA,
      getOrganization: async () => ({ status: 'active' }),
      repository: h.repo,
      mail: h.mail,
      canonicalOrigin: staticCanonicalOrigin('https://race.example.test'),
    });
    await expect(
      task(
        {
          type: 'mail.outbox',
          schemaVersion: 1,
          correlationId: 'c',
          payload: { outboxId: 'mail-1' },
        },
        { job: { id: 'j' } },
      ),
    ).resolves.toBeUndefined();
    await expect(
      task(
        {
          type: 'mail.outbox',
          schemaVersion: 1,
          organizationId: organizationB,
          correlationId: 'c',
          payload: { outboxId: 'mail-1' },
        },
        { job: { id: 'j' } },
      ),
    ).resolves.toBeUndefined();
    expect(h.mail.send).not.toHaveBeenCalled();
    expect(h.state()).toMatchObject({
      status: 'pending',
      attempts: 0,
      claims: 0,
    });
  });
  it('binds verification links to the origin of the job organization', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const run = async (origin: string | null) => {
      const h = setup(tenantId);
      const task = createMailOutboxTask({
        deploymentMode: 'cloud',
        getOrganization: async () => ({ status: 'active' }),
        repository: h.repo,
        mail: h.mail,
        canonicalOrigin: async (tenant) =>
          tenant.organizationId === tenantId
            ? origin
            : 'https://other.example.test',
      });
      await task(
        {
          type: 'mail.outbox',
          schemaVersion: 1,
          organizationId: tenantId,
          correlationId: 'c',
          payload: { outboxId: 'mail-1' },
        },
        { job: { id: 'j' } },
      );
      return h;
    };
    const sent = await run('https://example.test');
    expect(sent.mail.send).toHaveBeenCalledOnce();
    const foreign = run('https://other.example.test');
    await expect(foreign).rejects.toThrow(/canonical origin/);
    await expect(run(null)).rejects.toThrow(/unavailable/);
  });
  it('ends missing and foreign tenant jobs without sending or mutating state', async () => {
    const h = setup();
    const task = (repository: MailOutboxRepository) =>
      createMailOutboxTask({
        deploymentMode: 'cloud',
        getOrganization: async () => ({ status: 'active' }),
        repository,
        mail: h.mail,
        canonicalOrigin: staticCanonicalOrigin('https://race.example.test'),
      });
    await task({ ...h.repo, get: async () => null })(
      {
        type: 'mail.outbox',
        schemaVersion: 1,
        organizationId: '11111111-1111-4111-8111-111111111111',
        correlationId: 'c',
        payload: { outboxId: 'missing' },
      },
      { job: { id: 'job' } },
    );
    await task({
      ...h.repo,
      get: async () => ({
        ...(await h.repo.get(ctx, 'mail-1'))!,
        organizationId: 'org-b',
      }),
    })(
      {
        type: 'mail.outbox',
        schemaVersion: 1,
        organizationId: '11111111-1111-4111-8111-111111111111',
        correlationId: 'c',
        payload: { outboxId: 'mail-1' },
      },
      { job: { id: 'job' } },
    );
    expect(h.mail.send).not.toHaveBeenCalled();
    expect(h.state()).toMatchObject({
      status: 'pending',
      attempts: 0,
      claims: 0,
      deliveries: [],
    });
  });
});

describe('message campaign delivery', () => {
  it('renders campaign content and forwards uploaded PDFs to the mail adapter', async () => {
    const row: MailOutboxRecord = {
      id: 'message-1',
      organizationId: 'org-a',
      eventId: 'event-1',
      templateKey: 'message-campaign',
      templateVersion: 1,
      locale: 'en',
      recipient: 'driver@example.test',
      idempotencyKey: 'campaign-entry',
      variables: { subject: 'Hello Ada', body: 'Welcome to Spring Run' },
      status: 'pending',
      attempts: 0,
      attachments: [
        {
          filename: 'rules.pdf',
          contentType: 'application/pdf',
          content: new Uint8Array([37, 80, 68, 70, 45]),
        },
      ],
    };
    let finished = false;
    const repository: MailOutboxRepository = {
      get: async () => row,
      claim: async () => ({ ...row, status: 'sending' }),
      template: async () => null,
      organizationMailConfig: async () => ({
        from: 'club@example.test',
        replyTo: null,
      }),
      finish: async (_context, _id, result) => {
        finished = result.outcome === 'sent';
      },
    };
    const sent: Array<
      Parameters<
        NonNullable<
          Parameters<typeof processMailOutboxJob>[0]['deps']['mail']['send']
        >
      >[0]
    > = [];
    await processMailOutboxJob({
      ctx,
      outboxId: row.id,
      deps: {
        repository,
        mail: {
          send: async (message) => {
            sent.push(message);
          },
        },
      },
    });
    expect(finished).toBe(true);
    expect(sent[0]).toMatchObject({
      subject: 'Hello Ada',
      text: 'Welcome to Spring Run',
      to: row.recipient,
    });
    expect(sent[0]?.attachments?.[0]).toMatchObject({
      filename: 'rules.pdf',
      contentType: 'application/pdf',
    });
  });
});

describe('campaign attachment storage delivery', () => {
  it('loads tenant-owned PDFs from object storage before SMTP delivery', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const objectId = '22222222-2222-4222-8222-222222222222';
    const row: MailOutboxRecord = {
      id: 'mail-attachment',
      organizationId: tenantId,
      eventId: 'event-id',
      templateKey: 'message-campaign',
      templateVersion: 1,
      locale: 'en',
      recipient: 'driver@example.test',
      idempotencyKey: 'mail-attachment-key',
      variables: {
        subject: 'Hello',
        body: 'See attached',
      },
      status: 'pending',
      attempts: 0,
      attachmentRefs: [{ objectId, filename: 'rules.pdf' }],
    };
    const repository: MailOutboxRepository = {
      get: async () => row,
      claim: async () => ({ ...row, status: 'sending' }),
      template: async () => null,
      organizationMailConfig: async () => ({
        from: 'club@example.test',
        replyTo: null,
      }),
      finish: async () => {},
    };
    const storage: ObjectStorageProvider = {
      put: async () => {
        throw new Error('not used');
      },
      head: async (requestedTenant, requestedObject) =>
        requestedTenant === organizationId(tenantId) &&
        requestedObject === objectId
          ? {
              organizationId: organizationId(tenantId),
              objectId,
              contentType: 'application/pdf',
              size: 5,
              sha256: 'a'.repeat(64),
            }
          : null,
      get: async (requestedTenant, requestedObject) =>
        requestedTenant === organizationId(tenantId) &&
        requestedObject === objectId
          ? {
              ref: {
                organizationId: organizationId(tenantId),
                objectId,
                contentType: 'application/pdf',
                size: 5,
                sha256: 'a'.repeat(64),
              },
              body: new Uint8Array([37, 80, 68, 70, 45]),
            }
          : null,
      delete: async () => {},
    };
    const received: MailAttachment[][] = [];
    const task = createMailOutboxTask({
      deploymentMode: 'cloud',
      getOrganization: async () => ({ status: 'active' }),
      repository,
      mail: {
        send: async (message) => {
          received.push([...(message.attachments ?? [])]);
        },
      },
      canonicalOrigin: staticCanonicalOrigin('https://example.test'),
      storage,
    });
    await task(
      {
        type: 'mail.outbox',
        schemaVersion: 1,
        organizationId: tenantId,
        correlationId: 'corr',
        payload: { outboxId: row.id },
      },
      { job: { id: 'worker-job' } },
    );
    expect(received[0]).toEqual([
      {
        filename: 'rules.pdf',
        contentType: 'application/pdf',
        content: new Uint8Array([37, 80, 68, 70, 45]),
      },
    ]);
  });
});
