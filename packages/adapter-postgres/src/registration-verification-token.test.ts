import { describe, expect, it } from 'vitest';
import { createRegistrationVerificationToken } from './registration-verification-token.js';

describe('registration verification token issuance', () => {
  it('creates a URL-safe token with a digest and configured expiry', () => {
    const now = new Date('2030-01-01T00:00:00.000Z');
    const issued = createRegistrationVerificationToken(now, 60_000);
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.expiresAt).toEqual(new Date(now.getTime() + 60_000));
  });
});
