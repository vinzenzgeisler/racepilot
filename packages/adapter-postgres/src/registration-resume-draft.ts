import type { RequestContext } from '@racepilot/core';
import {
  registrationFormDrafts,
  registrationFormUploads,
} from './schema/forms.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { events } from './schema/organization.js';
import type { PublicRegistrationDependencies } from './registration-public-types.js';
import { RegistrationUnavailable } from '@racepilot/core';

export function createRegistrationResumeDraftMethods(
  dependencies: PublicRegistrationDependencies,
) {
  const { db, hashToken } = dependencies;
  return {
    resumeDraft: async (ctx: RequestContext, token: string) =>
      db.transaction(async (tx) => {
        const now = new Date();
        const digest = hashToken(token);
        const [draft] = await tx
          .select()
          .from(registrationFormDrafts)
          .where(
            and(
              eq(registrationFormDrafts.organizationId, ctx.organizationId),
              eq(registrationFormDrafts.resumeTokenHash, digest),
              sql`${registrationFormDrafts.expiresAt} > ${now}`,
              sql`${registrationFormDrafts.consumedAt} is null`,
            ),
          )
          .for('update')
          .limit(1);
        if (!draft) return null;
        const [consumed] = await tx
          .update(registrationFormDrafts)
          .set({ consumedAt: now })
          .where(
            and(
              eq(registrationFormDrafts.id, draft.id),
              eq(registrationFormDrafts.resumeTokenHash, digest),
              sql`${registrationFormDrafts.consumedAt} is null`,
              sql`${registrationFormDrafts.expiresAt} > ${now}`,
            ),
          )
          .returning({ id: registrationFormDrafts.id });
        if (!consumed) return null;
        const resumedDraft = structuredClone(draft.draftData);
        const answers = resumedDraft.customAnswers;
        if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
          for (const [fieldKey, answer] of Object.entries(
            answers as Record<string, unknown>,
          )) {
            if (
              answer &&
              typeof answer === 'object' &&
              !Array.isArray(answer)
            ) {
              const objectId = (answer as { objectId?: unknown }).objectId;
              if (typeof objectId !== 'string')
                throw new RegistrationUnavailable('draft-upload-invalid');
              const token = randomBytes(32).toString('base64url');
              const [rotated] = await tx
                .update(registrationFormUploads)
                .set({ uploadTokenHash: hashToken(token) })
                .where(
                  and(
                    eq(
                      registrationFormUploads.organizationId,
                      ctx.organizationId,
                    ),
                    eq(registrationFormUploads.eventId, draft.eventId),
                    eq(registrationFormUploads.fieldKey, fieldKey),
                    eq(registrationFormUploads.objectId, objectId),
                    sql`${registrationFormUploads.registrationGroupId} is null`,
                    sql`${registrationFormUploads.consumedAt} is null`,
                    sql`${registrationFormUploads.expiresAt} > ${now}`,
                  ),
                )
                .returning({ id: registrationFormUploads.id });
              if (!rotated) throw new RegistrationUnavailable('upload-missing');
              (answers as Record<string, unknown>)[fieldKey] = {
                objectId,
                uploadToken: token,
              };
            }
          }
        }
        return {
          eventSlug:
            (
              await tx
                .select({ slug: events.slug })
                .from(events)
                .where(
                  and(
                    eq(events.organizationId, ctx.organizationId),
                    eq(events.id, draft.eventId),
                  ),
                )
                .limit(1)
            )[0]?.slug ?? null,
          language: draft.language,
          draft: resumedDraft,
        };
      }),
  };
}
