import { describe, expect, it, vi } from 'vitest';
import { processMailOutboxJob, renderMailTemplate, type MailOutboxRepository } from './mail.js';
import type { JobContext } from '@racepilot/core';
const ctx: JobContext = { deploymentMode: 'cloud', organizationId: 'org-a' as JobContext['organizationId'], jobId: 'job', correlationId: 'corr' };
function setup() {
  const row = { id: 'mail-1', organizationId: 'org-a', eventId: null, templateKey: 'verification' as const, templateVersion: 1, locale: 'en' as const, recipient: 'person@example.test', idempotencyKey: 'key', variables: { recipientName: '<Sam>', verificationUrl: 'https://example.test/verify' }, status: 'pending' as const, attempts: 0 };
  let status: string = 'pending'; let attempts = 0; let claims = 0; const deliveries: unknown[] = [];
  const repo: MailOutboxRepository = {
    get: async () => ({ ...row, status: status as typeof row.status, attempts }),
    claim: async () => { if (status !== 'pending') return null; status = 'sending'; claims++; return { ...row, status: 'sending', attempts }; },
    template: async () => null, organizationMailConfig: async () => ({ from: 'org@example.test', replyTo: null }),
    finish: async (_ctx, _id, result) => { status = result.outcome === 'sent' ? 'sent' : result.outcome === 'failed' ? 'failed' : 'pending'; attempts = result.attempts; deliveries.push(result); },
  };
  const mail = { send: vi.fn(async () => {}) };
  return { repo, repository: repo, mail, state: () => ({ status, attempts, claims, deliveries }) };
}
describe('mail outbox worker', () => {
  it('escapes HTML values and rejects unknown placeholders', () => {
    expect(renderMailTemplate({ subject: '{{recipientName}}', text: '{{recipientName}}', html: '{{recipientName}}' }, 'verification', { recipientName: '<x>', verificationUrl: 'url' }).html).toBe('&lt;x&gt;');
    expect(() => renderMailTemplate({ subject: '{{foreign}}', text: '', html: '' }, 'verification', { recipientName: 'x', verificationUrl: 'u' })).toThrow('Unknown');
  });
  it('retries with exponential backoff and marks final failure', async () => {
    const h = setup(); h.mail.send = vi.fn().mockRejectedValue(new Error('smtp unavailable'));
    await expect(processMailOutboxJob({ ctx, outboxId: 'mail-1', deps: { ...h, now: () => new Date(0), maxAttempts: 2 } })).rejects.toThrow();
    await processMailOutboxJob({ ctx, outboxId: 'mail-1', deps: { ...h, now: () => new Date(0), maxAttempts: 2 } });
    expect(h.state().status).toBe('failed');
    expect(h.state().deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'retry', availableAt: new Date(30_000) }), expect.objectContaining({ outcome: 'failed' })]));
  });
  it('a duplicate execution does not send again after delivery', async () => {
    const h = setup();
    await processMailOutboxJob({ ctx, outboxId: 'mail-1', deps: h });
    await processMailOutboxJob({ ctx, outboxId: 'mail-1', deps: h });
    expect(h.mail.send).toHaveBeenCalledTimes(1);
  });
  it('rejects absent and foreign organization jobs', async () => {
    const h = setup();
    await expect(processMailOutboxJob({ ctx, outboxId: 'missing', deps: { ...h, repository: { ...h.repo, get: async () => null } } })).rejects.toThrow();
    await expect(processMailOutboxJob({ ctx, outboxId: 'mail-1', deps: { ...h, repository: { ...h.repo, get: async () => ({ ...(await h.repo.get(ctx, 'mail-1'))!, organizationId: 'org-b' }) } } })).rejects.toThrow();
  });
});
