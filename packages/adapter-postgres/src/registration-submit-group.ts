import { createHash } from 'node:crypto';
import {
  mapRegistrationContactDetails,
  type RequestContext,
} from '@racepilot/core';
import { eq, and, sql } from 'drizzle-orm';
import { registrationGroups } from './schema/entries.js';
import { registrationFormUploads } from './schema/forms.js';
import type {
  RegistrationFileUploadReference,
  RegistrationSubmissionEvent,
  RegistrationSubmissionTransaction,
} from './registration-submit-types.js';
import type { PublicRegistrationPayload } from './registration-settings.js';

export async function createRegistrationGroup(args: {
  tx: RegistrationSubmissionTransaction;
  ctx: RequestContext;
  event: RegistrationSubmissionEvent;
  payload: PublicRegistrationPayload;
  personId: string;
  needsGuardian: boolean;
  safeCustomAnswers: Record<string, string | boolean | { objectId: string }>;
  customFileUploads: RegistrationFileUploadReference[];
  receivedAt: Date;
}): Promise<{
  groupId: string;
  selectedTerms: NonNullable<RegistrationSubmissionEvent['consentTerms']>;
}> {
  const {
    tx,
    ctx,
    event,
    payload,
    personId,
    needsGuardian,
    safeCustomAnswers,
    customFileUploads,
    receivedAt,
  } = args;
  const unavailable = () => new Error('Registration unavailable');
  const consentTerms = event.consentTerms ?? [];
  const selectedTerms = payload.consents.map((consent) => {
    const term = consentTerms.find(
      (item) =>
        item.key === consent.key &&
        item.version === consent.version &&
        item.language === payload.language &&
        item.hash === consent.hash,
    );
    if (!term) throw unavailable();
    const actualHash = createHash('sha256').update(term.text).digest('hex');
    if (actualHash !== consent.hash) throw unavailable();
    return term;
  });
  if (
    consentTerms.some(
      (term) =>
        term.language === payload.language &&
        term.required !== false &&
        !selectedTerms.some(
          (selected) =>
            selected.key === term.key &&
            selected.version === term.version &&
            selected.hash === term.hash,
        ),
    )
  )
    throw unavailable();
  const [priorGroup] = await tx
    .select({ id: registrationGroups.id })
    .from(registrationGroups)
    .where(
      and(
        eq(registrationGroups.organizationId, ctx.organizationId),
        eq(registrationGroups.eventId, event.id),
        eq(registrationGroups.personId, personId),
      ),
    )
    .limit(1);
  if (priorGroup) throw unavailable();
  const [group] = await tx
    .insert(registrationGroups)
    .values({
      organizationId: ctx.organizationId,
      eventId: event.id,
      personId,
      contactEmail: payload.person.email.trim(),
      guardianName: needsGuardian ? payload.person.guardianName!.trim() : null,
      guardianEmail: needsGuardian
        ? payload.person.guardianEmail!.trim()
        : null,
      customAnswers: safeCustomAnswers,
      // Contact data belongs to this registration, never to the organization-wide person.
      ...mapRegistrationContactDetails(payload.person),
    })
    .returning({ id: registrationGroups.id });
  for (const upload of customFileUploads) {
    const [consumed] = await tx
      .update(registrationFormUploads)
      .set({ registrationGroupId: group!.id, consumedAt: receivedAt })
      .where(
        and(
          eq(registrationFormUploads.organizationId, ctx.organizationId),
          eq(registrationFormUploads.eventId, event.id),
          eq(registrationFormUploads.fieldKey, upload.fieldKey),
          eq(registrationFormUploads.objectId, upload.objectId),
          eq(registrationFormUploads.uploadTokenHash, upload.tokenHash),
          sql`${registrationFormUploads.consumedAt} is null`,
        ),
      )
      .returning({ id: registrationFormUploads.id });
    if (!consumed) throw unavailable();
  }
  return { groupId: group!.id, selectedTerms };
}
