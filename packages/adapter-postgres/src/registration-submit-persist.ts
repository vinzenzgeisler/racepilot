import { desc, eq, and } from 'drizzle-orm';
import { calculatePrice, normalizeRequestedStartNumber } from '@racepilot/core';
import type { RequestContext } from '@racepilot/core';
import { eventClassPricingRules } from './schema/billing.js';
import { emailTemplateVersions } from './mail-schema.js';
import { vehicles } from './schema/entries.js';
import { consentEvidence } from './schema/forms.js';
import { eventClasses } from './schema/organization.js';
import { groupEmailVerifications } from './schema/public-registration.js';
import { publicEntrySubmissions } from './schema/public-registration.js';
import { createEntryRepository } from './entry-repository.js';
import { createInvoiceRepository } from './billing-invoices.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import type { Database, TransactionDatabase } from './database.js';
import type { PublicRegistrationPayload } from './registration-settings.js';
import type { RegistrationSubmissionEvent } from './registration-submit-types.js';

export async function persistRegistrationSubmission(args: {
  db: Database;
  tx: TransactionDatabase;
  ctx: RequestContext;
  event: RegistrationSubmissionEvent;
  payload: PublicRegistrationPayload;
  receivedAt: Date;
  token: string;
  tokenHash: string;
  tokenTtlMs?: number;
  canonicalBase: URL;
  currency: string;
  groupId: string;
  personId: string;
  uniqueClassIds: string[];
  selectedTerms: NonNullable<RegistrationSubmissionEvent['consentTerms']>;
}): Promise<{ accepted: true; entryCount: number }> {
  const {
    db,
    tx,
    ctx,
    event,
    payload,
    receivedAt,
    token,
    tokenHash,
    tokenTtlMs,
    canonicalBase,
    currency,
    groupId,
    personId,
    uniqueClassIds,
    selectedTerms,
  } = args;
  const unavailable = () => new Error('Registration unavailable');
  const [template] = await tx
    .select()
    .from(emailTemplateVersions)
    .where(
      and(
        eq(emailTemplateVersions.organizationId, ctx.organizationId),
        eq(emailTemplateVersions.templateKey, 'verification'),
        eq(emailTemplateVersions.locale, payload.language),
      ),
    )
    .orderBy(desc(emailTemplateVersions.version))
    .limit(1);
  const classRules = await tx
    .select()
    .from(eventClassPricingRules)
    .where(
      and(
        eq(eventClassPricingRules.organizationId, ctx.organizationId),
        eq(eventClassPricingRules.eventId, event.id),
      ),
    )
    .for('share');
  const selectedRules = classRules.filter((rule) =>
    uniqueClassIds.includes(rule.classId),
  );
  if (classRules.length > 0 && selectedRules.length !== uniqueClassIds.length)
    throw unavailable();
  const snapshot =
    classRules.length > 0
      ? calculatePrice({
          currency,
          submittedAt: receivedAt.toISOString(),
          lines: selectedRules.map((rule) => ({
            classId: rule.classId,
            quantity: payload.entries.filter(
              (entry) => entry.classId === rule.classId,
            ).length,
            rule: {
              classId: rule.classId,
              baseCents: rule.baseCents,
              additionalEntryAdjustmentCents:
                rule.additionalEntryAdjustmentCents,
              earlyBirdDeadline: rule.earlyBirdDeadline?.toISOString() ?? null,
              earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
            },
          })),
        })
      : null;
  const classTypes = new Map(
    (
      await tx
        .select({ id: eventClasses.id, vehicleType: eventClasses.vehicleType })
        .from(eventClasses)
        .where(
          and(
            eq(eventClasses.organizationId, ctx.organizationId),
            eq(eventClasses.eventId, event.id),
          ),
        )
    ).map((row) => [row.id, row.vehicleType]),
  );
  const entryRepo = createEntryRepository(db);
  const invoiceRepo = createInvoiceRepository(db);
  const entryIds: string[] = [];
  for (const requestEntry of payload.entries) {
    const [vehicle] = await tx
      .insert(vehicles)
      .values({
        organizationId: ctx.organizationId,
        make: requestEntry.vehicle.make.trim(),
        model: requestEntry.vehicle.model.trim(),
        year: requestEntry.vehicle.year,
        registration: requestEntry.vehicle.registration?.trim() ?? null,
        // The type is not asked: it follows the class the vehicle starts in.
        vehicleType: classTypes.get(requestEntry.classId) ?? null,
        displacementCc: requestEntry.vehicle.displacementCc ?? null,
        cylinders: requestEntry.vehicle.cylinders ?? null,
        ownerName: requestEntry.vehicle.ownerName ?? null,
        history: requestEntry.vehicle.history ?? null,
      })
      .returning({ id: vehicles.id });
    const entry = await entryRepo.create!(
      ctx,
      {
        eventId: event.id,
        classId: requestEntry.classId,
        registrationGroupId: groupId,
        driverPersonId: personId,
        vehicleId: vehicle!.id,
        requestedStartNumber: normalizeRequestedStartNumber(
          requestEntry.requestedStartNumber,
        ),
        priceSnapshotVersion: snapshot?.version ?? null,
        priceSnapshot: snapshot,
        formSnapshotVersion: payload.formVersion,
      },
      tx,
    );
    entryIds.push(entry.id);
  }
  if (snapshot) await invoiceRepo.issue(ctx, event.id, groupId, snapshot, tx);
  for (const term of selectedTerms)
    await tx.insert(consentEvidence).values({
      organizationId: ctx.organizationId,
      eventId: event.id,
      registrationGroupId: groupId,
      textKey: term.key,
      textVersion: term.version,
      language: payload.language,
      textHash: term.hash,
      acceptedAt: receivedAt,
    });
  await tx.insert(groupEmailVerifications).values({
    organizationId: ctx.organizationId,
    eventId: event.id,
    registrationGroupId: groupId,
    tokenHash,
    expiresAt: new Date(
      receivedAt.getTime() + (tokenTtlMs ?? 24 * 60 * 60_000),
    ),
  });
  const verificationUrl = new URL(
    `/registration/verify?token=${encodeURIComponent(token)}`,
    canonicalBase,
  ).toString();
  await enqueueMailOutbox(
    db,
    ctx.organizationId,
    {
      eventId: event.id,
      registrationGroupId: groupId,
      templateKey: 'verification',
      templateVersion: template?.version ?? 1,
      templateVersionId: template?.id ?? null,
      locale: payload.language,
      recipient: payload.person.email,
      idempotencyKey: `registration-verification:${payload.submissionId}`,
      variables: {
        verificationUrl,
        recipientName: `${payload.person.firstName.trim()} ${payload.person.lastName.trim()}`,
      },
      correlationId: payload.submissionId,
    },
    tx,
  );
  const response = { accepted: true as const, entryCount: entryIds.length };
  await tx
    .update(publicEntrySubmissions)
    .set({ registrationGroupId: groupId, response })
    .where(
      and(
        eq(publicEntrySubmissions.organizationId, ctx.organizationId),
        eq(publicEntrySubmissions.eventId, event.id),
        eq(publicEntrySubmissions.submissionId, payload.submissionId),
      ),
    );
  return response;
}
