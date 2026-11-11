import { createHash, randomBytes } from 'node:crypto';
import { MESSAGE_VERIFICATION_TOKEN_TTL_MS } from '@racepilot/contracts';

export function createRegistrationVerificationToken(
  now = new Date(),
  ttlMs = MESSAGE_VERIFICATION_TOKEN_TTL_MS,
) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(now.getTime() + ttlMs),
  };
}
