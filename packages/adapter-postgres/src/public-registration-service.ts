import type { Database } from './database.js';
import { createHash, randomBytes } from 'node:crypto';
import { createRegistrationUploadMethods } from './registration-upload.js';
import { createRegistrationStartNumberMethods } from './registration-start-number.js';
import { createRegistrationSaveDraftMethods } from './registration-save-draft.js';
import { createRegistrationResumeDraftMethods } from './registration-resume-draft.js';
import { createRegistrationFormMethods } from './registration-form.js';
import { createRegistrationVerificationMethods } from './registration-verification.js';
import type { RequestContext } from '@racepilot/core';
import type { PublicRegistrationPayload } from './registration-settings.js';
import { organizations, events } from './schema/organization.js';
import { eq, and } from 'drizzle-orm';
import { ProviderError } from '@racepilot/core';
import { publicEntrySubmissions } from './schema/public-registration.js';
import { sql } from 'drizzle-orm';
import { validateRegistrationCustomAnswers } from './registration-submit-answers.js';
import { resolveRegistrationParticipant } from './registration-submit-participant.js';
import { createRegistrationGroup } from './registration-submit-group.js';
import { persistRegistrationSubmission } from './registration-submit-persist.js';

export function createPublicRegistrationService(
  db: Database,
  options: { canonicalBaseUrl: string; tokenTtlMs?: number },
) {
  const canonicalBase = new URL(options.canonicalBaseUrl);
  if (!['https:', 'http:'].includes(canonicalBase.protocol))
    throw new Error('Invalid canonical URL');
  const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');
  const dependencies = { db, options, canonicalBase, hashToken };
  return {
    ...createRegistrationUploadMethods(dependencies),
    ...createRegistrationStartNumberMethods(dependencies),
    ...createRegistrationSaveDraftMethods(dependencies),
    ...createRegistrationResumeDraftMethods(dependencies),
    ...createRegistrationFormMethods(dependencies),
    submit: async (
      ctx: RequestContext,
      eventSlug: string,
      payload: PublicRegistrationPayload,
    ) => {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      const canonicalize = (value: unknown): string => {
        if (Array.isArray(value))
          return `[${value.map(canonicalize).join(',')}]`;
        if (value && typeof value === 'object') {
          const record = value as Record<string, unknown>;
          return `{${Object.keys(record)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
            .join(',')}}`;
        }
        return JSON.stringify(value) ?? 'null';
      };
      const requestFingerprint = createHash('sha256')
        .update(canonicalize(payload))
        .digest('hex');
      const receivedAt = new Date();
      return db.transaction(async (tx) => {
        const [event] = await tx
          .select()
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.slug, eventSlug),
            ),
          )
          .for('share')
          .limit(1);
        const unavailable = () => new Error('Registration unavailable');
        const submissionConflict = () =>
          new ProviderError('conflict', 'Submission ID conflict');
        if (!event) throw unavailable();
        const [existingSubmission] = await tx
          .select()
          .from(publicEntrySubmissions)
          .where(
            and(
              eq(publicEntrySubmissions.organizationId, ctx.organizationId),
              eq(publicEntrySubmissions.eventId, event.id),
              eq(publicEntrySubmissions.submissionId, payload.submissionId),
            ),
          )
          .limit(1);
        if (existingSubmission) {
          if (existingSubmission.requestFingerprint !== requestFingerprint)
            throw submissionConflict();
          if (existingSubmission.response) return existingSubmission.response;
        }
        if (
          event.status !== 'open' ||
          (event.registrationOpensAt &&
            event.registrationOpensAt > receivedAt) ||
          (event.registrationClosesAt &&
            event.registrationClosesAt < receivedAt)
        )
          throw unavailable();
        const formConfig = (event.registrationFormConfig ?? {}) as Record<
          string,
          unknown
        >;
        const formFeatures = (formConfig.features ?? {}) as Record<
          string,
          unknown
        >;
        const orgFormConfig = (
          await tx
            .select({ config: organizations.registrationFormConfig })
            .from(organizations)
            .where(eq(organizations.id, ctx.organizationId))
            .limit(1)
        )[0]?.config as Record<string, unknown> | null | undefined;
        const orgFormFeatures = (orgFormConfig?.features ?? {}) as Record<
          string,
          unknown
        >;
        const customFields = (formConfig.customFields ??
          orgFormConfig?.customFields ??
          []) as Array<{
          key: string;
          type: 'text' | 'select' | 'yes_no' | 'file';
          required: boolean;
          options?: Array<{ value: string }>;
        }>;
        const customAnswers = payload.customAnswers ?? {};
        const customFieldByKey = new Map(
          customFields.map((field) => [field.key, field]),
        );
        if (
          Object.keys(customAnswers).some((key) => !customFieldByKey.has(key))
        )
          throw unavailable();

        if (
          payload.entries.length > 1 &&
          (formFeatures.multipleEntries ?? orgFormFeatures.multipleEntries) ===
            false
        )
          throw unavailable();
        const eventNumberState = (
          (formConfig.fields ?? {}) as Record<string, Record<string, unknown>>
        ).requestedStartNumber?.state;
        const orgNumberState = (
          (orgFormConfig?.fields ?? {}) as Record<
            string,
            Record<string, unknown>
          >
        ).requestedStartNumber?.state;
        if (
          (eventNumberState ?? orgNumberState) === 'hidden' &&
          payload.entries.some((entry) => entry.requestedStartNumber)
        )
          throw unavailable();
        if (!existingSubmission) {
          const [reservation] = await tx
            .insert(publicEntrySubmissions)
            .values({
              organizationId: ctx.organizationId,
              eventId: event.id,
              submissionId: payload.submissionId,
              requestFingerprint,
            })
            .onConflictDoUpdate({
              target: [
                publicEntrySubmissions.organizationId,
                publicEntrySubmissions.eventId,
                publicEntrySubmissions.submissionId,
              ],
              set: {
                requestFingerprint: sql`${publicEntrySubmissions.requestFingerprint}`,
              },
            })
            .returning({
              requestFingerprint: publicEntrySubmissions.requestFingerprint,
              response: publicEntrySubmissions.response,
              inserted: sql<boolean>`xmax = 0`,
            });
          if (!reservation) throw unavailable();
          if (!reservation.inserted) {
            if (reservation.requestFingerprint !== requestFingerprint)
              throw submissionConflict();
            if (reservation.response) return reservation.response;
            throw unavailable();
          }
        }
        const { safeCustomAnswers, customFileUploads } =
          await validateRegistrationCustomAnswers({
            tx,
            ctx,
            eventId: event.id,
            customFields,
            customAnswers,
            receivedAt,
            hashToken,
          });
        const [org] = await tx
          .select({
            settings: organizations.registrationSettings,
            currency: organizations.currency,
          })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .limit(1);
        if (!org) throw unavailable();
        const settings = org.settings ?? {
          sharedContactEmail: 'allowed' as const,
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        };
        const { personId, needsGuardian, uniqueClassIds } =
          await resolveRegistrationParticipant({
            tx,
            ctx,
            event,
            payload,
            settings,
          });
        const { groupId, selectedTerms } = await createRegistrationGroup({
          tx,
          ctx,
          event,
          payload,
          personId,
          needsGuardian,
          safeCustomAnswers,
          customFileUploads,
          receivedAt,
        });
        return persistRegistrationSubmission({
          db,
          tx,
          ctx,
          event,
          payload,
          receivedAt,
          token,
          tokenHash,
          ...(options.tokenTtlMs === undefined
            ? {}
            : { tokenTtlMs: options.tokenTtlMs }),
          canonicalBase,
          currency: org.currency,
          groupId,
          personId,
          uniqueClassIds,
          selectedTerms,
        });
      });
    },
    ...createRegistrationVerificationMethods(dependencies),
  };
}
