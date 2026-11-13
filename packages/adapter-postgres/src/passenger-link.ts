import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { PASSENGER_LINK_TTL_MS } from '@racepilot/core';
import type { TransactionDatabase } from './database.js';
import { emailTemplateVersions } from './mail-schema.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import { entryPassengerLinks } from './schema/passengers.js';
import type { Database } from './database.js';

export const hashPassengerToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** A random token the link carries; only its SHA-256 hash is stored. */
export function createPassengerToken(now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashPassengerToken(token),
    expiresAt: new Date(now.getTime() + PASSENGER_LINK_TTL_MS),
  };
}

export interface PassengerLinkTarget {
  organizationId: string;
  eventId: string;
  passengerId: string;
  entryId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  language: 'de' | 'en';
  driverName: string;
  eventName: string;
}

/**
 * Revokes the open links of the co-driver, stores a new one and queues the mail when an address
 * is on record. Runs in the caller's transaction so the link and its mail commit together.
 */
export async function issuePassengerLink(
  db: Database,
  tx: TransactionDatabase,
  target: PassengerLinkTarget,
  origin: string,
  actor: string,
  now = new Date(),
): Promise<{ url: string; expiresAt: Date; mailQueued: boolean }> {
  const { token, tokenHash, expiresAt } = createPassengerToken(now);
  await tx
    .update(entryPassengerLinks)
    .set({ revokedAt: now })
    .where(
      and(
        eq(entryPassengerLinks.organizationId, target.organizationId),
        eq(entryPassengerLinks.passengerId, target.passengerId),
        isNull(entryPassengerLinks.usedAt),
        isNull(entryPassengerLinks.revokedAt),
      ),
    );
  const [link] = await tx
    .insert(entryPassengerLinks)
    .values({
      organizationId: target.organizationId,
      eventId: target.eventId,
      passengerId: target.passengerId,
      tokenHash,
      expiresAt,
      createdBy: actor,
    })
    .returning({ id: entryPassengerLinks.id });
  const url = new URL(
    `/passenger?token=${encodeURIComponent(token)}`,
    origin,
  ).toString();
  if (!target.email) return { url, expiresAt, mailQueued: false };
  const [template] = await tx
    .select({
      id: emailTemplateVersions.id,
      version: emailTemplateVersions.version,
    })
    .from(emailTemplateVersions)
    .where(
      and(
        eq(emailTemplateVersions.organizationId, target.organizationId),
        eq(emailTemplateVersions.templateKey, 'passenger-link'),
        eq(emailTemplateVersions.locale, target.language),
      ),
    )
    .orderBy(desc(emailTemplateVersions.version))
    .limit(1);
  await enqueueMailOutbox(
    db,
    target.organizationId,
    {
      eventId: target.eventId,
      templateKey: 'passenger-link',
      templateVersion: template?.version ?? 1,
      templateVersionId: template?.id ?? null,
      locale: target.language,
      recipient: target.email,
      idempotencyKey: `passenger-link:${link!.id}`,
      variables: {
        recipientName: `${target.firstName} ${target.lastName}`.trim(),
        driverName: target.driverName,
        eventName: target.eventName,
        linkUrl: url,
      },
    },
    tx,
  );
  return { url, expiresAt, mailQueued: true };
}
