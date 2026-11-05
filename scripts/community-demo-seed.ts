import { rows, classes, gradientImage } from './community-demo-data.js';
import { and, eq, sql } from 'drizzle-orm';
import {
  calculatePrice,
  defaultEntryWorkflow,
  organizationId,
  transitionEntry,
} from '@racepilot/core';
import {
  createDatabase,
  createEventRepository,
  createEventClassRepository,
  createEventClassPricingRepository,
  createPersonRepository,
  createVehicleRepository,
  createEntryRepository,
  createEntryWorkflowRepository,
  createEntryStatusDimensionRepository,
  createInvoiceRepository,
  createInvoicePaymentRepository,
  organizations,
  people,
  entries,
  registrationGroups,
  vehicles,
} from '@racepilot/adapter-postgres';

if (
  process.env.COMMUNITY_DEMO_SEED !== 'I_UNDERSTAND' ||
  process.env.DEPLOYMENT_MODE !== 'community'
) {
  throw new Error(
    'Demo seed requires COMMUNITY_DEMO_SEED=I_UNDERSTAND and DEPLOYMENT_MODE=community',
  );
}
const url = process.env.DATABASE_URL;
const slug = process.env.COMMUNITY_ORGANIZATION_SLUG;
if (!url || !slug)
  throw new Error('DATABASE_URL and COMMUNITY_ORGANIZATION_SLUG are required');

const { db, pool } = await createDatabase(url);
try {
  const orgRows = await db.select().from(organizations);
  if (orgRows.length !== 1 || orgRows[0]!.slug !== slug)
    throw new Error('Community organization mismatch');
  const org = orgRows[0]!;
  const ctx = {
    deploymentMode: 'community' as const,
    organizationId: organizationId(org.id),
    permissions: new Set(['entry:write', 'role:admin']),
    capabilities: new Set<string>(),
    correlationId: 'community-demo-seed',
  };
  const eventRepo = createEventRepository(db);
  let event = (await eventRepo.listByOrganization(ctx)).find(
    (item) => item.slug === 'historischer-bergpreis-2027',
  );
  if (!event) {
    event = await eventRepo.create(ctx, {
      slug: 'historischer-bergpreis-2027',
      name: 'Historischer Bergpreis 2027',
      startsOn: '2027-05-22',
      endsOn: '2027-05-23',
      registrationOpensAt: '2026-11-01T00:00:00+01:00',
      registrationClosesAt: '2027-05-14T23:59:00+02:00',
    });
    await eventRepo.transition(ctx, event.id, 'draft', 'open', new Date());
    const workflow = {
      ...defaultEntryWorkflow,
      statuses: defaultEntryWorkflow.statuses.map((s) => ({
        ...s,
        labels: {
          ...s.labels,
          de:
            (
              {
                pending: 'Offen',
                accepted: 'Zugelassen',
                waitlisted: 'Vorauswahl',
                rejected: 'Abgelehnt',
                withdrawn: 'Abgesagt',
              } as Record<string, string>
            )[s.key] ?? s.labels.de,
        },
      })),
    };
    await createEntryWorkflowRepository(db).setEvent(
      ctx,
      event.id,
      workflow,
      'demo-seed',
      'Designstatus für Beispieldaten',
    );
  }
  const classRepo = createEventClassRepository(db);
  const pricing = createEventClassPricingRepository(db);
  const existingClasses = await classRepo.listByEvent(ctx, event.id);
  const byCode = new Map(existingClasses.map((c) => [c.code, c]));
  for (const spec of classes) {
    let item = byCode.get(spec.code);
    if (!item) {
      item = await classRepo.create(ctx, event.id, {
        code: spec.code,
        name: spec.name,
        vehicleType: spec.vehicleType,
        sortOrder: spec.sortOrder,
        maxParticipants: null,
        closed: false,
      });
      byCode.set(spec.code, item);
    }
    await pricing.upsert(ctx, event.id, {
      classId: item.id,
      baseCents: spec.fee,
      additionalEntryAdjustmentCents: 0,
      earlyBirdDeadline: null,
      earlyBirdDiscountCents: 0,
    });
  }
  const entryRepo = createEntryRepository(db);
  const statusRepo = createEntryStatusDimensionRepository(db);
  const invoiceRepo = createInvoiceRepository(db);
  const paymentRepo = createInvoicePaymentRepository(db);
  let created = 0;
  for (const [index, row] of rows.entries()) {
    const [
      fullName,
      make,
      model,
      classCode,
      number,
      acceptance,
      payment,
      technical,
      waiver,
      registration,
    ] = row;
    const [firstName, ...lastParts] = fullName.split(' ');
    const lastName = lastParts.join(' ');
    const email = `demo-${String(index + 1).padStart(3, '0')}@example.invalid`;
    const existing = await db
      .select({ id: entries.id, vehicleId: entries.vehicleId })
      .from(entries)
      .innerJoin(
        people,
        and(
          eq(people.organizationId, entries.organizationId),
          eq(people.id, entries.driverPersonId),
        ),
      )
      .where(
        and(
          eq(entries.organizationId, org.id),
          eq(entries.eventId, event.id),
          eq(people.emailNormalized, email),
        ),
      )
      .limit(1);
    if (existing.length) {
      await db
        .update(vehicles)
        .set({ imageUrl: gradientImage(index) })
        .where(
          and(
            eq(vehicles.organizationId, org.id),
            eq(vehicles.id, existing[0]!.vehicleId),
            sql`${vehicles.imageUrl} is null`,
          ),
        );
      continue;
    }
    const person = await createPersonRepository(db).create(ctx, {
      firstName: firstName!,
      lastName,
      email,
      dateOfBirth: `${1970 + (index % 28)}-04-12`,
      country: 'DE',
    });
    const vehicle = await createVehicleRepository(db).create(ctx, {
      make,
      model,
      year: 1970 + (index % 30),
      registration,
      imageUrl: gradientImage(index),
    });
    const [group] = await db
      .insert(registrationGroups)
      .values({
        organizationId: org.id,
        eventId: event.id,
        personId: person.id,
        contactEmail: email,
      })
      .returning();
    const eventClass = byCode.get(classCode)!;
    const fee = classes.find((c) => c.code === classCode)!.fee;
    const snapshot =
      payment === 'none'
        ? null
        : calculatePrice({
            currency: 'EUR',
            submittedAt: new Date().toISOString(),
            lines: [
              {
                classId: eventClass.id,
                quantity: 1,
                rule: {
                  classId: eventClass.id,
                  baseCents: fee,
                  additionalEntryAdjustmentCents: 0,
                  earlyBirdDeadline: null,
                  earlyBirdDiscountCents: 0,
                },
              },
            ],
          });
    const entry = await entryRepo.create!(ctx, {
      eventId: event.id,
      classId: eventClass.id,
      registrationGroupId: group!.id,
      driverPersonId: person.id,
      vehicleId: vehicle.id,
      requestedStartNumber: number,
      priceSnapshotVersion: snapshot?.version ?? null,
      priceSnapshot: snapshot,
      formSnapshotVersion: 'demo-1',
    });
    await transitionEntry(
      ctx,
      entry.id,
      'verification',
      'verified',
      'demo-seed',
      'Beispielprüfung',
      { entries: entryRepo, workflows: createEntryWorkflowRepository(db) },
    );
    if (acceptance !== 'pending')
      await transitionEntry(
        ctx,
        entry.id,
        'acceptance',
        acceptance,
        'demo-seed',
        'Beispielstatus',
        { entries: entryRepo, workflows: createEntryWorkflowRepository(db) },
      );
    if (technical !== 'pending' && technical !== 'not_relevant')
      await statusRepo.transition(
        ctx,
        entry.id,
        'technical_inspection',
        technical,
        'demo-seed',
        'Beispielabnahme',
      );
    if (waiver !== 'f_pending' && waiver !== 'not_relevant')
      await statusRepo.transition(
        ctx,
        entry.id,
        'waiver',
        waiver,
        'demo-seed',
        'Beispielhaftverzicht',
      );
    if (snapshot) {
      const invoice = await invoiceRepo.issue(
        ctx,
        event.id,
        group!.id,
        snapshot,
      );
      if (payment === 'paid')
        await paymentRepo.record(
          ctx,
          invoice.id,
          snapshot.totalCents,
          'demo-seed',
          'Beispielzahlung',
        );
    }
    created++;
  }
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(eq(entries.organizationId, org.id), eq(entries.eventId, event.id)),
    );
  console.log(
    `Historischer Bergpreis 2027: ${total} Nennungen (${created} neu)`,
  );
} finally {
  await pool.end();
}
