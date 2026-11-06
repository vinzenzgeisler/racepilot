import { isDeepStrictEqual } from 'node:util';
import { defaultEntryStatusDimensionConfig } from '@racepilot/core';
import { classes, demoWorkflow } from './community-demo-data.js';
import {
  createEventRepository,
  createEventClassRepository,
  createEventClassPricingRepository,
  createEntryWorkflowRepository,
  createEntryStatusDimensionRepository,
  type createDatabase,
} from '@racepilot/adapter-postgres';

type Db = Awaited<ReturnType<typeof createDatabase>>['db'];
type DemoContext = Parameters<
  ReturnType<typeof createEventRepository>['listByOrganization']
>[0];

const demoStatusLabels: Record<string, Record<string, string>> = {
  payment: {
    open: 'Offen',
    partially_paid: 'Teilweise bezahlt',
    paid: 'Bezahlt',
    not_required: 'Keine',
    not_relevant: '–',
  },
  technical_inspection: {
    pending: 'Ausstehend',
    reinspection: 'Nachprüfung',
    passed: 'Bestanden',
    not_relevant: '–',
  },
  waiver: {
    f_pending: 'F · Ausstehend',
    f_signed: 'F · Signiert',
    bf_signed: 'BF · Signiert',
    not_relevant: '–',
  },
};
const demoStatusConfig = {
  ...defaultEntryStatusDimensionConfig,
  dimensions: defaultEntryStatusDimensionConfig.dimensions.map((dimension) => ({
    ...dimension,
    values: dimension.values.map((value) => ({
      ...value,
      labels: {
        ...value.labels,
        de: demoStatusLabels[dimension.key]?.[value.key] ?? value.labels.de,
      },
    })),
  })),
};

export async function ensureDemoEvent(db: Db, ctx: DemoContext) {
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
    await createEntryWorkflowRepository(db).setEvent(
      ctx,
      event.id,
      demoWorkflow,
      'demo-seed',
      'Designstatus für Beispieldaten',
    );
  }
  // Migrate only the prior demo ordering; leave any custom ordering untouched.
  const previousDemoStatusKeys = [
    'pending',
    'accepted',
    'rejected',
    'waitlisted',
    'withdrawn',
  ];
  const workflowRepo = createEntryWorkflowRepository(db);
  const currentWorkflow = await workflowRepo.getEffective(ctx, event.id);
  if (
    currentWorkflow?.eventId === event.id &&
    isDeepStrictEqual(
      currentWorkflow.workflow.statuses.map((status) => status.key),
      previousDemoStatusKeys,
    ) &&
    isDeepStrictEqual(
      currentWorkflow.workflow.transitions,
      demoWorkflow.transitions,
    ) &&
    currentWorkflow.workflow.statuses.length === demoWorkflow.statuses.length &&
    currentWorkflow.workflow.statuses.every((status) =>
      demoWorkflow.statuses.some((expected) =>
        isDeepStrictEqual(expected, status),
      ),
    ) &&
    !isDeepStrictEqual(currentWorkflow.workflow.statuses, demoWorkflow.statuses)
  ) {
    await workflowRepo.setEvent(
      ctx,
      event.id,
      demoWorkflow,
      'demo-seed',
      'Statusreihenfolge nach Design',
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
  const statusRepo = createEntryStatusDimensionRepository(db);
  const current = await statusRepo.getEvent(ctx, event.id);
  if (JSON.stringify(current) !== JSON.stringify(demoStatusConfig))
    await statusRepo.setEvent(
      { ...ctx, permissions: new Set([...ctx.permissions, 'event:write']) },
      event.id,
      demoStatusConfig,
      'demo-seed',
      'Beschriftungen nach Design',
    );
  return { event, byCode };
}
