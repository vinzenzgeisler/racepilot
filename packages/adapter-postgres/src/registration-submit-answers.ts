import type { RequestContext } from '@racepilot/core';
import { eq, and, sql } from 'drizzle-orm';
import { registrationFormUploads } from './schema/forms.js';
import type {
  RegistrationCustomField,
  RegistrationFileUploadReference,
  RegistrationSubmissionTransaction,
} from './registration-submit-types.js';

export async function validateRegistrationCustomAnswers(args: {
  tx: RegistrationSubmissionTransaction;
  ctx: RequestContext;
  eventId: string;
  customFields: RegistrationCustomField[];
  customAnswers: Record<
    string,
    string | boolean | { objectId: string; uploadToken: string }
  >;
  receivedAt: Date;
  hashToken: (token: string) => string;
}): Promise<{
  safeCustomAnswers: Record<string, string | boolean | { objectId: string }>;
  customFileUploads: RegistrationFileUploadReference[];
}> {
  const {
    tx,
    ctx,
    eventId,
    customFields,
    customAnswers,
    receivedAt,
    hashToken,
  } = args;
  const safeCustomAnswers: Record<
    string,
    string | boolean | { objectId: string }
  > = {};
  const customFileUploads: RegistrationFileUploadReference[] = [];
  const unavailable = () => new Error('Registration unavailable');
  for (const field of customFields) {
    const rawAnswer = customAnswers[field.key];
    const answer =
      field.type === 'text' && typeof rawAnswer === 'string'
        ? rawAnswer.trim()
        : rawAnswer;
    if (answer === undefined || answer === '') {
      if (field.required) throw unavailable();
      continue;
    }
    if (field.type === 'text' && typeof answer === 'string') {
      safeCustomAnswers[field.key] = answer;
    } else if (
      field.type === 'select' &&
      typeof answer === 'string' &&
      field.options?.some((option) => option.value === answer)
    ) {
      safeCustomAnswers[field.key] = answer;
    } else if (field.type === 'yes_no' && typeof answer === 'boolean') {
      safeCustomAnswers[field.key] = answer;
    } else if (field.type === 'file' && typeof answer === 'object') {
      const tokenHash = hashToken(answer.uploadToken);
      const [upload] = await tx
        .select({
          id: registrationFormUploads.id,
          objectId: registrationFormUploads.objectId,
        })
        .from(registrationFormUploads)
        .where(
          and(
            eq(registrationFormUploads.organizationId, ctx.organizationId),
            eq(registrationFormUploads.eventId, eventId),
            eq(registrationFormUploads.fieldKey, field.key),
            eq(registrationFormUploads.objectId, answer.objectId),
            eq(registrationFormUploads.uploadTokenHash, tokenHash),
            sql`${registrationFormUploads.consumedAt} is null`,
            sql`${registrationFormUploads.expiresAt} > ${receivedAt}`,
          ),
        )
        .for('update')
        .limit(1);
      if (!upload) throw unavailable();
      safeCustomAnswers[field.key] = { objectId: upload.objectId };
      customFileUploads.push({
        fieldKey: field.key,
        objectId: upload.objectId,
        tokenHash,
      });
    } else {
      throw unavailable();
    }
  }
  return { safeCustomAnswers, customFileUploads };
}
