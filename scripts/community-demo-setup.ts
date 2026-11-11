import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { defaultEntryStatusDimensionConfig } from '@racepilot/core';
import { classes, demoWorkflow } from './community-demo-data.js';
import {
  createEventRepository,
  createOrganizationRepository,
  createEventClassRepository,
  createEventClassPricingRepository,
  createEntryWorkflowRepository,
  createEntryStatusDimensionRepository,
  createRegistrationFormConfigRepository,
  createEventConsentRepository,
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
  const organizationRepo = createOrganizationRepository(db);
  const organization = await organizationRepo.getById(ctx);
  if (
    organization &&
    (!organization.contactEmail ||
      organization.contactEmail === 'veranstalter@example.invalid' ||
      organization.name === 'NENNBOX')
  )
    await organizationRepo.update(ctx, {
      ...(organization.name === 'NENNBOX'
        ? { name: 'Beispielverein e. V.' }
        : {}),
      ...(!organization.contactEmail ||
      organization.contactEmail === 'veranstalter@example.invalid'
        ? { contactEmail: 'nennung@beispiel.test' }
        : {}),
    });
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
  const consentRepository = createEventConsentRepository(db);
  const consentTerms = await consentRepository.get(ctx, event.id);
  const existingConsentTerms = consentTerms ?? [];
  const isPreviousDemoConsent =
    existingConsentTerms.length > 0 &&
    existingConsentTerms.length <= 2 &&
    existingConsentTerms.every(
      (term) => term.key === 'participation' && term.version === '1',
    );
  if (!consentTerms?.length || isPreviousDemoConsent) {
    const examples = [
      {
        key: 'participation',
        language: 'de' as const,
        text: 'Ich bestätige, dass meine Angaben vollständig und korrekt sind und ich die Teilnahmebedingungen gelesen habe.',
        required: true,
      },
      {
        key: 'privacy',
        language: 'de' as const,
        text: 'Ich habe die Datenschutzhinweise zur Kenntnis genommen.',
        required: true,
      },
      {
        key: 'media',
        language: 'de' as const,
        text: 'Fotos und Videos, auf denen ich erkennbar bin, dürfen für Berichte über die Veranstaltung genutzt werden.',
        required: false,
      },
      {
        key: 'future-events',
        language: 'de' as const,
        text: 'Der Veranstalter darf mich über künftige Veranstaltungen informieren.',
        required: false,
      },
      {
        key: 'participation',
        language: 'en' as const,
        text: 'I confirm my details are complete and accurate and that I have read the participation terms.',
        required: true,
      },
      {
        key: 'privacy',
        language: 'en' as const,
        text: 'I have read the privacy information.',
        required: true,
      },
      {
        key: 'media',
        language: 'en' as const,
        text: 'Photos and videos showing me may be used in event reports.',
        required: false,
      },
      {
        key: 'future-events',
        language: 'en' as const,
        text: 'The organizer may contact me about future events.',
        required: false,
      },
    ];
    await consentRepository.update(
      ctx,
      event.id,
      examples.map(({ language, text, key, required }) => ({
        key,
        version: '1',
        language,
        text,
        hash: createHash('sha256').update(text).digest('hex'),
        required,
      })),
      'demo-seed',
    );
  }
  const formConfigs = createRegistrationFormConfigRepository(db);
  const eventFormConfig = await formConfigs.getEvent(ctx, event.id);
  const existingFormConfig =
    eventFormConfig && typeof eventFormConfig === 'object'
      ? eventFormConfig
      : {};
  const customFields = Array.isArray(existingFormConfig.customFields)
    ? existingFormConfig.customFields
    : [];
  const demoCustomFields = [
    {
      key: 'biography',
      type: 'text',
      required: false,
      label: { de: 'Sportlicher Werdegang', en: 'Racing background' },
    },
    {
      key: 'organizer_notes',
      type: 'text',
      required: false,
      label: {
        de: 'Hinweise an den Veranstalter',
        en: 'Notes for the organizer',
      },
    },
  ];
  if (
    !('organizerNotice' in existingFormConfig) ||
    customFields.length === 0 ||
    customFields.some((field) => field.key === 'organizerNotes')
  )
    await formConfigs.updateEvent(
      ctx,
      event.id,
      {
        ...existingFormConfig,
        organizerNotice:
          existingFormConfig.organizerNotice ??
          'Bitte bringe die Fahrzeugpapiere und einen gültigen Führerschein zur technischen Abnahme mit. Die Startnummer wird am Veranstaltungstag ausgegeben.',
        customFields: customFields.some(
          (field) => field.key === 'organizerNotes',
        )
          ? demoCustomFields
          : customFields.length > 0
            ? customFields
            : demoCustomFields,
      },
      'demo-seed',
    );
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
