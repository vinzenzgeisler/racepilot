import type { RequestContext } from '@racepilot/core';
import { randomBytes } from 'node:crypto';
import { normalizeEmail } from '@racepilot/core';
import { organizations, events } from './schema/organization.js';
import { eq, and } from 'drizzle-orm';
import {
  registrationFormDrafts,
  registrationFormUploads,
} from './schema/forms.js';
import { sql } from 'drizzle-orm';
import { enqueueMailOutbox } from './mail-outbox.js';
import { randomUUID } from 'node:crypto';
import type { PublicRegistrationDependencies } from './registration-public-types.js';
import { RegistrationUnavailable } from '@racepilot/core';

export function createRegistrationSaveDraftMethods(
  dependencies: PublicRegistrationDependencies,
) {
  const { hashToken, db, canonicalBase } = dependencies;
  return {
    saveDraft: async (
      ctx: RequestContext,
      eventSlug: string,
      email: string,
      language: 'de' | 'en',
      draftData: Record<string, unknown>,
    ) => {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      const normalized = normalizeEmail(email);
      const now = new Date();
      const ttl = 7 * 24 * 60 * 60_000;
      return db.transaction(async (tx) => {
        const [event] = await tx
          .select()
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.slug, eventSlug),
              eq(events.status, 'open'),
            ),
          )
          .limit(1)
          .for('share');
        if (
          !event ||
          (event.registrationClosesAt && event.registrationClosesAt <= now)
        )
          throw new RegistrationUnavailable('registration-closed');
        // Draft JSON is long-lived and must never retain an upload bearer token.
        // Validate each file reference against the tenant/event/field-scoped
        // upload row, then persist only its opaque object id. resumeDraft
        // rotates the hash and returns a fresh token to the participant.
        const safeDraftData = structuredClone(draftData);
        const draftAnswers = safeDraftData.customAnswers;
        if (
          draftAnswers &&
          typeof draftAnswers === 'object' &&
          !Array.isArray(draftAnswers)
        ) {
          const [organization] = await tx
            .select({ config: organizations.registrationFormConfig })
            .from(organizations)
            .where(eq(organizations.id, ctx.organizationId))
            .limit(1);
          const organizationConfig = organization?.config as
            Record<string, unknown> | null | undefined;
          const eventConfig = event.registrationFormConfig as Record<
            string,
            unknown
          > | null;
          const configuredFields = (eventConfig?.customFields ??
            organizationConfig?.customFields ??
            []) as Array<{
            key: string;
            type: 'text' | 'select' | 'yes_no' | 'file';
            options?: Array<{ value: string }>;
          }>;
          const fieldsByKey = new Map(
            configuredFields.map((field) => [field.key, field]),
          );
          for (const [fieldKey, answer] of Object.entries(
            draftAnswers as Record<string, unknown>,
          )) {
            const field = fieldsByKey.get(fieldKey);
            if (!field)
              throw new RegistrationUnavailable('draft-field-unknown');
            if (
              answer &&
              typeof answer === 'object' &&
              !Array.isArray(answer)
            ) {
              if (field.type !== 'file')
                throw new RegistrationUnavailable('draft-upload-invalid');
              const fileAnswer = answer as {
                objectId?: unknown;
                uploadToken?: unknown;
              };
              if (
                typeof fileAnswer.objectId !== 'string' ||
                typeof fileAnswer.uploadToken !== 'string'
              )
                throw new RegistrationUnavailable('draft-upload-invalid');
              const [upload] = await tx
                .select({ id: registrationFormUploads.id })
                .from(registrationFormUploads)
                .where(
                  and(
                    eq(
                      registrationFormUploads.organizationId,
                      ctx.organizationId,
                    ),
                    eq(registrationFormUploads.eventId, event.id),
                    eq(registrationFormUploads.fieldKey, fieldKey),
                    eq(registrationFormUploads.objectId, fileAnswer.objectId),
                    eq(
                      registrationFormUploads.uploadTokenHash,
                      hashToken(fileAnswer.uploadToken),
                    ),
                    sql`${registrationFormUploads.registrationGroupId} is null`,
                    sql`${registrationFormUploads.consumedAt} is null`,
                    sql`${registrationFormUploads.expiresAt} > ${now}`,
                  ),
                )
                .for('update')
                .limit(1);
              if (!upload) throw new RegistrationUnavailable('upload-missing');
              (draftAnswers as Record<string, unknown>)[fieldKey] = {
                objectId: fileAnswer.objectId,
              };
            } else if (
              answer !== undefined &&
              answer !== '' &&
              !(
                (field.type === 'text' && typeof answer === 'string') ||
                (field.type === 'select' &&
                  typeof answer === 'string' &&
                  field.options?.some((option) => option.value === answer)) ||
                (field.type === 'yes_no' && typeof answer === 'boolean')
              )
            ) {
              throw new RegistrationUnavailable('invalid-answer');
            }
          }
        }
        await tx
          .insert(registrationFormDrafts)
          .values({
            organizationId: ctx.organizationId,
            eventId: event.id,
            emailNormalized: normalized,
            recipientEmail: email.trim(),
            language,
            draftData: safeDraftData,
            resumeTokenHash: tokenHash,
            expiresAt: new Date(now.getTime() + ttl),
            consumedAt: null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              registrationFormDrafts.organizationId,
              registrationFormDrafts.eventId,
              registrationFormDrafts.emailNormalized,
            ],
            set: {
              recipientEmail: email.trim(),
              language,
              draftData: safeDraftData,
              resumeTokenHash: tokenHash,
              expiresAt: new Date(now.getTime() + ttl),
              consumedAt: null,
              updatedAt: now,
            },
          });
        const resumeUrl = new URL(
          `/registration/resume#token=${encodeURIComponent(token)}`,
          canonicalBase,
        ).toString();
        await enqueueMailOutbox(
          db,
          ctx.organizationId,
          {
            eventId: event.id,
            templateKey: 'registration-resume',
            templateVersion: 1,
            templateVersionId: null,
            locale: language,
            recipient: email.trim(),
            idempotencyKey: `registration-resume:${event.id}:${tokenHash}`,
            variables: {
              recipientName:
                typeof safeDraftData.firstName === 'string'
                  ? safeDraftData.firstName.slice(0, 100)
                  : '',
              resumeUrl,
            },
            correlationId: randomUUID(),
          },
          tx,
        );
        return { sent: true as const };
      });
    },
  };
}
