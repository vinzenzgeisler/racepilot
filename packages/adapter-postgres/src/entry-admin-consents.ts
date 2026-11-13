import { and, eq, inArray } from 'drizzle-orm';
import type { AdminEntryConsent, RequestContext } from '@racepilot/core';
import type { Database } from './database.js';
import { consentEvidence } from './schema/forms.js';
import { events } from './schema/organization.js';

/**
 * Recorded acceptances per registration group, from the stored evidence only.
 * The wording is looked up by the version and hash the participant accepted; when the event
 * no longer carries that exact text it is reported as missing instead of guessed.
 */
export async function loadConsentEvidence(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  groupIds: string[],
): Promise<Map<string, AdminEntryConsent[]>> {
  const result = new Map<string, AdminEntryConsent[]>();
  if (!groupIds.length) return result;
  const rows = await db
    .select({
      groupId: consentEvidence.registrationGroupId,
      key: consentEvidence.textKey,
      version: consentEvidence.textVersion,
      language: consentEvidence.language,
      textHash: consentEvidence.textHash,
      acceptedAt: consentEvidence.acceptedAt,
      terms: events.consentTerms,
    })
    .from(consentEvidence)
    .innerJoin(
      events,
      and(
        eq(events.id, consentEvidence.eventId),
        eq(events.organizationId, consentEvidence.organizationId),
      ),
    )
    .where(
      and(
        eq(consentEvidence.organizationId, ctx.organizationId),
        inArray(consentEvidence.registrationGroupId, groupIds),
      ),
    );
  for (const row of rows.sort(
    (a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime(),
  )) {
    const list = result.get(row.groupId) ?? [];
    list.push(toAdminConsent(row));
    result.set(row.groupId, list);
  }
  return result;
}

/** One stored acceptance with the wording that carries exactly its version and hash, if the event still has it. */
export function toAdminConsent(row: {
  key: string;
  version: string;
  language: string;
  textHash: string;
  acceptedAt: Date;
  terms: Array<{
    key: string;
    version: string;
    language: string;
    text: string;
    hash: string;
    required?: boolean;
  }> | null;
}): AdminEntryConsent {
  const term = (row.terms ?? []).find(
    (item) =>
      item.key === row.key &&
      item.version === row.version &&
      item.language === row.language &&
      item.hash === row.textHash,
  );
  return {
    key: row.key,
    version: row.version,
    language: row.language === 'en' ? 'en' : 'de',
    acceptedAt: row.acceptedAt.toISOString(),
    text: term?.text ?? null,
    required: term ? term.required !== false : null,
  };
}
