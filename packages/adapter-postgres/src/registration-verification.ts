import type { RequestContext } from '@racepilot/core';
import { groupEmailVerifications } from './schema/public-registration.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { entries, entryAuditEvents } from './schema/entries.js';
import { assertEntryTransition } from '@racepilot/core';
import type { PublicRegistrationDependencies } from './registration-public-types.js';
import { issueRegistrationPassengerLinks } from './passenger-registration-links.js';

export function createRegistrationVerificationMethods(
  dependencies: PublicRegistrationDependencies,
) {
  const { db, hashToken, canonicalOrigin } = dependencies;
  return {
    verify: async (ctx: RequestContext, token: string) =>
      db.transaction(async (tx) => {
        const now = new Date();
        const digest = hashToken(token);
        const [verification] = await tx
          .select()
          .from(groupEmailVerifications)
          .where(
            and(
              eq(groupEmailVerifications.organizationId, ctx.organizationId),
              eq(groupEmailVerifications.tokenHash, digest),
              sql`${groupEmailVerifications.consumedAt} is null`,
              sql`${groupEmailVerifications.expiresAt} > ${now}`,
            ),
          )
          .for('update')
          .limit(1);
        if (!verification) return false;
        const consumed = await tx
          .update(groupEmailVerifications)
          .set({ consumedAt: now })
          .where(
            and(
              eq(groupEmailVerifications.organizationId, ctx.organizationId),
              eq(groupEmailVerifications.id, verification.id),
              sql`${groupEmailVerifications.consumedAt} is null`,
              sql`${groupEmailVerifications.expiresAt} > ${now}`,
            ),
          )
          .returning({ id: groupEmailVerifications.id });
        if (!consumed.length) return false;
        const groupEntries = await tx
          .select({
            id: entries.id,
            verificationStatus: entries.verificationStatus,
          })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.eventId, verification.eventId),
              eq(entries.registrationGroupId, verification.registrationGroupId),
              sql`${entries.deletedAt} is null`,
            ),
          );
        for (const entry of groupEntries) {
          if (entry.verificationStatus === 'verified') continue;
          assertEntryTransition(
            'verification',
            entry.verificationStatus,
            'verified',
          );
          const updated = await tx
            .update(entries)
            .set({ verificationStatus: 'verified' })
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.id, entry.id),
                eq(entries.verificationStatus, entry.verificationStatus),
              ),
            )
            .returning({
              id: entries.id,
              workflowRevisionId: entries.workflowRevisionId,
            });
          if (updated.length)
            await tx.insert(entryAuditEvents).values({
              organizationId: ctx.organizationId,
              entryId: entry.id,
              transition: 'verification',
              fromStatus: entry.verificationStatus,
              toStatus: 'verified',
              actor: 'email-verification',
              reason: 'Registration group email verified',
              workflowRevisionId: updated[0]!.workflowRevisionId!,
            });
        }
        await issueRegistrationPassengerLinks(db, tx, ctx, {
          canonicalOrigin,
          registrationGroupId: verification.registrationGroupId,
        });
        return groupEntries.length > 0;
      }),
  };
}
