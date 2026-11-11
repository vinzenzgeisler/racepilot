import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { MESSAGE_VERIFICATION_TOKEN_TTL_MS } from '@racepilot/core';
import type { TransactionDatabase } from './database.js';
import { groupEmailVerifications } from './schema/public-registration.js';

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

export async function persistRegistrationVerificationToken(
  tx: TransactionDatabase,
  input: {
    organizationId: string;
    eventId: string;
    registrationGroupId: string;
    tokenHash: string;
    expiresAt: Date;
    replaceExisting?: boolean;
  },
): Promise<void> {
  if (input.replaceExisting)
    await tx
      .update(groupEmailVerifications)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(groupEmailVerifications.organizationId, input.organizationId),
          eq(groupEmailVerifications.eventId, input.eventId),
          eq(
            groupEmailVerifications.registrationGroupId,
            input.registrationGroupId,
          ),
          isNull(groupEmailVerifications.consumedAt),
        ),
      );
  await tx.insert(groupEmailVerifications).values({
    organizationId: input.organizationId,
    eventId: input.eventId,
    registrationGroupId: input.registrationGroupId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
  });
}
