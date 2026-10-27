import { describe, expect, it } from 'vitest';
import { createSmtpMailProvider } from './index.js';
import { organizationId, ProviderError } from '@racepilot/core';

describe('SMTP mail port contract', () => {
  it('requires complete safe configuration', () => {
    expect(() =>
      createSmtpMailProvider({ host: '', port: 25, secure: false, from: '' }),
    ).toThrowError(ProviderError);
  });
  it('exports an adapter accepting only tenant-bound messages', async () => {
    const provider = createSmtpMailProvider({
      host: '127.0.0.1',
      port: 1,
      secure: false,
      from: 'RacePilot <noreply@example.test>',
    });
    await expect(
      provider.send({
        organizationId: organizationId('org_1'),
        to: 'a@example.test',
        subject: 'test',
        text: 'body',
        idempotencyKey: 'key',
      }),
    ).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Mail delivery failed',
    });
  });
});
