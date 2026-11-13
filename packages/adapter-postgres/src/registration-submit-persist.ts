import { desc, eq, and, inArray } from 'drizzle-orm';
import {
  RegistrationUnavailable,
  calculatePrice,
  effectivePassengerMode,
  type PassengerMode,
  mapRegistrationVehicleDetails,
  normalizeEmail,
  normalizeRequestedStartNumber,
  MESSAGE_VERIFICATION_TOKEN_TTL_MS,
} from '@racepilot/core';
import type { RequestContext } from '@racepilot/core';
import { eventClassPricingRules } from './schema/billing.js';
import { emailTemplateVersions } from './mail-schema.js';
import { vehicles, entries } from './schema/entries.js';
import { consentEvidence } from './schema/forms.js';
import { persistRegistrationVerificationToken } from './registration-verification-token.js';
import { eventClasses } from './schema/organization.js';
import { publicEntrySubmissions } from './schema/public-registration.js';
import { createEntryRepository } from './entry-repository.js';
import { createInvoiceRepository } from './billing-invoices.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import { entryPassengers } from './schema/passengers.js';
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
  canonicalOrigin: string;
  currency: string;
  groupId: string;
  personId: string;
  uniqueClassIds: string[];
  selectedTerms: NonNullable<RegistrationSubmissionEvent['consentTerms']>;
  /** What the event's form offers beyond the standard entry. */
  features: { passenger: boolean; spareVehicle: boolean };
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
    canonicalOrigin,
    currency,
    groupId,
    personId,
    uniqueClassIds,
    selectedTerms,
    features,
  } = args;
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
    throw new RegistrationUnavailable('class-price-missing');
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
  const classRows = await tx
    .select({
      id: eventClasses.id,
      vehicleType: eventClasses.vehicleType,
      passengerMode: eventClasses.passengerMode,
    })
    .from(eventClasses)
    .where(
      and(
        eq(eventClasses.organizationId, ctx.organizationId),
        eq(eventClasses.eventId, event.id),
      ),
    );
  const classTypes = new Map(classRows.map((row) => [row.id, row.vehicleType]));
  const passengerModes = new Map(
    classRows.map((row) => [
      row.id,
      effectivePassengerMode(
        features.passenger,
        row.passengerMode as PassengerMode,
      ),
    ]),
  );
  for (const requestEntry of payload.entries) {
    const mode = passengerModes.get(requestEntry.classId) ?? 'none';
    if (requestEntry.passenger && mode === 'none')
      throw new RegistrationUnavailable('passenger-unavailable');
    if (!requestEntry.passenger && mode === 'required')
      throw new RegistrationUnavailable('passenger-required');
    if (requestEntry.spareVehicle && !features.spareVehicle)
      throw new RegistrationUnavailable('spare-vehicle-unavailable');
  }
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
        ...mapRegistrationVehicleDetails(requestEntry.vehicle),
      })
      .returning({ id: vehicles.id });
    const spare = requestEntry.spareVehicle
      ? (
          await tx
            .insert(vehicles)
            .values({
              organizationId: ctx.organizationId,
              make: requestEntry.spareVehicle.make.trim(),
              model: requestEntry.spareVehicle.model.trim(),
              year: requestEntry.spareVehicle.year,
              registration:
                requestEntry.spareVehicle.registration?.trim() || null,
              vehicleType: classTypes.get(requestEntry.classId) ?? null,
            })
            .returning({ id: vehicles.id })
        )[0]
      : undefined;
    const entry = await entryRepo.create!(
      ctx,
      {
        eventId: event.id,
        classId: requestEntry.classId,
        registrationGroupId: groupId,
        driverPersonId: personId,
        vehicleId: vehicle!.id,
        spareVehicleId: spare?.id ?? null,
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
    if (requestEntry.passenger)
      await tx.insert(entryPassengers).values({
        organizationId: ctx.organizationId,
        eventId: event.id,
        entryId: entry.id,
        firstName: requestEntry.passenger.firstName.trim(),
        lastName: requestEntry.passenger.lastName.trim(),
        email: requestEntry.passenger.email?.trim() || null,
        emailNormalized: requestEntry.passenger.email
          ? normalizeEmail(requestEntry.passenger.email)
          : null,
        language: payload.language,
        source: 'registration',
        createdBy: `${payload.person.firstName.trim()} ${payload.person.lastName.trim()}`,
      });
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
  await persistRegistrationVerificationToken(tx, {
    organizationId: ctx.organizationId,
    eventId: event.id,
    registrationGroupId: groupId,
    tokenHash,
    expiresAt: new Date(
      receivedAt.getTime() + (tokenTtlMs ?? MESSAGE_VERIFICATION_TOKEN_TTL_MS),
    ),
  });
  const codeRows = await tx
    .select({ id: entries.id, code: entries.orgaCode })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, event.id),
        inArray(entries.id, entryIds),
      ),
    );
  const codeByEntry = new Map(codeRows.map((row) => [row.id, row.code]));
  const orgaCodes = entryIds.flatMap((id) => {
    const code = codeByEntry.get(id);
    return code ? [code] : [];
  });
  const verificationUrl = new URL(
    `/registration/verify?token=${encodeURIComponent(token)}`,
    canonicalOrigin,
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
        orgaCode: orgaCodes.join(', '),
        orgaCodes: orgaCodes.join(', '),
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
