import type { Database } from './database.js';
import { createHash } from 'node:crypto';
import { createRegistrationVerificationToken } from './registration-verification-token.js';
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
import {
  type CanonicalOrigin,
  resolveCanonicalOrigin,
  ProviderError,
  RegistrationUnavailable,
  registrationContactMatches,
  registrationVehicleDetailsMatch,
  registrationFeatureEnabled,
  resolveRegistrationFieldStates,
} from '@racepilot/core';
import { publicEntrySubmissions } from './schema/public-registration.js';
import { sql } from 'drizzle-orm';
import { validateRegistrationCustomAnswers } from './registration-submit-answers.js';
import { resolveRegistrationParticipant } from './registration-submit-participant.js';
import { createRegistrationGroup } from './registration-submit-group.js';
import { persistRegistrationSubmission } from './registration-submit-persist.js';

export function createPublicRegistrationService(
  db: Database,
  options: { canonicalOrigin: CanonicalOrigin; tokenTtlMs?: number },
) {
  const { canonicalOrigin } = options;
  const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');
  const dependencies = { db, options, canonicalOrigin, hashToken };
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
      const { token, tokenHash } = createRegistrationVerificationToken(
        new Date(),
        options.tokenTtlMs,
      );
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
      const origin = await resolveCanonicalOrigin(canonicalOrigin, ctx);
      if (!origin) throw new RegistrationUnavailable('origin-unavailable');
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
        const submissionConflict = () =>
          new ProviderError('conflict', 'Submission ID conflict');
        if (!event) throw new RegistrationUnavailable('event-unavailable');
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
          throw new RegistrationUnavailable('registration-closed');
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
          throw new RegistrationUnavailable('custom-field-unknown');

        if (
          payload.entries.length > 1 &&
          (formFeatures.multipleEntries ?? orgFormFeatures.multipleEntries) ===
            false
        )
          throw new RegistrationUnavailable('multiple-entries-disabled');
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
          throw new RegistrationUnavailable('requested-start-number-hidden');
        const fieldStates = resolveRegistrationFieldStates(
          orgFormConfig,
          formConfig,
        );
        if (
          !registrationContactMatches(payload.person, fieldStates) ||
          payload.entries.some(
            (entry) =>
              !registrationVehicleDetailsMatch(entry.vehicle, fieldStates),
          )
        )
          throw new RegistrationUnavailable('invalid-participant');
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
          if (!reservation)
            throw new RegistrationUnavailable('submission-in-progress');
          if (!reservation.inserted) {
            if (reservation.requestFingerprint !== requestFingerprint)
              throw submissionConflict();
            if (reservation.response) return reservation.response;
            throw new RegistrationUnavailable('submission-in-progress');
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
        if (!org) throw new RegistrationUnavailable('organization-unavailable');
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
          canonicalOrigin: origin,
          currency: org.currency,
          groupId,
          personId,
          uniqueClassIds,
          selectedTerms,
          features: {
            passenger: registrationFeatureEnabled(
              orgFormConfig,
              formConfig,
              'passenger',
            ),
            spareVehicle: registrationFeatureEnabled(
              orgFormConfig,
              formConfig,
              'spareVehicle',
            ),
          },
        });
      });
    },
    ...createRegistrationVerificationMethods(dependencies),
  };
}
