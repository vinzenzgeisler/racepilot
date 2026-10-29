import { describe, expect, it, vi } from 'vitest';
import {
  createMailOutboxTask,
  processMailOutboxJob,
  renderMailTemplate,
  defaultMailTemplate,
  type MailOutboxRepository,
} from './mail.js';
import type { JobContext } from '@racepilot/core';
const ctx: JobContext = {
  deploymentMode: 'cloud',
  organizationId: 'org-a' as JobContext['organizationId'],
  jobId: 'job',
  correlationId: 'corr',
};
function setup() {
  const row = {
    id: 'mail-1',
    organizationId: 'org-a',
    eventId: null,
    templateKey: 'verification' as const,
    templateVersion: 1,
    locale: 'en' as const,
    recipient: 'person@example.test',
    idempotencyKey: 'key',
    variables: {
      recipientName: '<Sam>',
      verificationUrl: 'https://example.test/verify',
    },
    status: 'pending' as const,
    attempts: 0,
  };
  let status: string = 'pending';
  let attempts = 0;
  let claims = 0;
  const deliveries: unknown[] = [];
  const repo: MailOutboxRepository = {
    get: async () => ({
      ...row,
      status: status as typeof row.status,
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
  it('renders the one-time participant status link mail in both locales', () => {
    for (const locale of ['de', 'en'] as const) {
      const template = renderMailTemplate(
        defaultMailTemplate('participant-status-access', locale),
        'participant-status-access',
        {
          recipientName: 'Sam',
          accessUrl: 'https://example.test/registration/status?token=secret',
        },
      );
      expect(template.text).toContain(
        'https://example.test/registration/status?token=secret',
      );
      expect(template.html).toContain(
        locale === 'en' ? 'one-time use' : 'einmalig verwendbar',
      );
    }
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
      canonicalBaseUrl: 'https://race.example.test',
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
  it('ends missing and foreign tenant jobs without sending or mutating state', async () => {
    const h = setup();
    const task = (repository: MailOutboxRepository) =>
      createMailOutboxTask({
        deploymentMode: 'cloud',
        getOrganization: async () => ({ status: 'active' }),
        repository,
        mail: h.mail,
        canonicalBaseUrl: 'https://race.example.test',
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
