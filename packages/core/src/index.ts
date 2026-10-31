export const deploymentModes = ['community', 'cloud'] as const;
export type DeploymentMode = (typeof deploymentModes)[number];
export type OrganizationId = string & { readonly __brand: 'OrganizationId' };
export function parseDeploymentMode(value: string): DeploymentMode {
  const mode = deploymentModes.find((candidate) => candidate === value);
  if (mode === undefined) throw new Error('Unsupported deployment mode');
  return mode;
}
export function organizationId(value: string): OrganizationId {
  if (value.trim().length === 0)
    throw new Error('Organization ID cannot be empty');
  return value as OrganizationId;
}
export interface RequestContext {
  readonly deploymentMode: DeploymentMode;
  readonly organizationId: OrganizationId;
  readonly subject?: { readonly issuer: string; readonly subject: string };
  readonly permissions: ReadonlySet<string>;
  readonly capabilities: ReadonlySet<string>;
  readonly correlationId: string;
}
export interface JobContext {
  readonly deploymentMode: DeploymentMode;
  readonly organizationId: OrganizationId;
  readonly jobId: string;
  readonly correlationId: string;
}
export function createRequestContext(input: RequestContext): RequestContext {
  return Object.freeze({ ...input });
}
export function createJobContext(input: JobContext): JobContext {
  return Object.freeze({ ...input });
}
export interface Organization {
  id: OrganizationId;
  slug: string;
  name: string;
  status: 'active' | 'disabled';
  contactEmail: string | null;
  websiteUrl: string | null;
  timezone: string;
  locale: string;
  currency: string;
}
export type OrganizationPatch = Partial<
  Pick<
    Organization,
    'name' | 'contactEmail' | 'websiteUrl' | 'timezone' | 'locale' | 'currency'
  >
>;
export interface OrganizationRepository {
  getById(ctx: RequestContext): Promise<Organization | null>;
  update(
    ctx: RequestContext,
    patch: OrganizationPatch,
  ): Promise<Organization | null>;
}
export interface EventRepository {
  listByOrganization(ctx: RequestContext): Promise<unknown[]>;
  getById(ctx: RequestContext, eventId: string): Promise<Event | null>;
  getPublicBySlug?(
    ctx: RequestContext,
    slug: string,
    now: Date,
  ): Promise<(Event & { classes: EventClass[] }) | null>;
  create?(ctx: RequestContext, input: EventInput): Promise<Event>;
  update?(
    ctx: RequestContext,
    eventId: string,
    patch: EventPatch,
  ): Promise<Event | null>;
  transition?(
    ctx: RequestContext,
    eventId: string,
    from: EventStatus,
    status: EventStatus,
    now: Date,
  ): Promise<Event | null>;
}
export interface Event {
  id: string;
  organizationId: OrganizationId;
  slug: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: EventStatus;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
}
export type EventStatus = 'draft' | 'open' | 'closed' | 'archived';
export interface EventInput {
  slug: string;
  name: string;
  startsOn: string;
  endsOn: string;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
}
export type EventPatch = Partial<EventInput>;
export type VehicleType = 'car' | 'motorcycle' | 'kart' | 'other';
export interface EventClass {
  id: string;
  organizationId: OrganizationId;
  eventId: string;
  name: string;
  code: string;
  vehicleType: VehicleType;
  sortOrder: number;
  maxParticipants: number | null;
  closed: boolean;
}
export type EventClassInput = Omit<
  EventClass,
  'id' | 'organizationId' | 'eventId'
>;
export interface EventClassRepository {
  listByEvent(ctx: RequestContext, eventId: string): Promise<EventClass[]>;
  create(
    ctx: RequestContext,
    eventId: string,
    input: EventClassInput,
  ): Promise<EventClass>;
  update(
    ctx: RequestContext,
    eventId: string,
    classId: string,
    patch: Partial<EventClassInput>,
  ): Promise<EventClass | null>;
}
export function canRegister(
  event: Pick<Event, 'status' | 'registrationOpensAt' | 'registrationClosesAt'>,
  eventClass: Pick<EventClass, 'closed'>,
  now = new Date(),
): boolean {
  const time = now.getTime();
  return (
    event.status === 'open' &&
    !eventClass.closed &&
    (event.registrationOpensAt === null ||
      time >= Date.parse(event.registrationOpensAt)) &&
    (event.registrationClosesAt === null ||
      time <= Date.parse(event.registrationClosesAt))
  );
}
const eventTransitions: Record<EventStatus, readonly EventStatus[]> = {
  draft: ['open'],
  open: ['closed'],
  closed: ['open', 'archived'],
  archived: [],
};
export function assertEventTransition(
  from: EventStatus,
  to: EventStatus,
): void {
  if (!eventTransitions[from].includes(to))
    throw new Error(`Invalid event transition: ${from} -> ${to}`);
}
export async function getEvent(
  ctx: RequestContext,
  eventId: string,
  deps: { events: EventRepository },
): Promise<Event | null> {
  if (!ctx.permissions.has('event:read')) throw new Error('Forbidden');
  return deps.events.getById(ctx, eventId);
}
export async function createEvent(
  ctx: RequestContext,
  input: EventInput,
  deps: { events: EventRepository },
): Promise<Event> {
  if (!ctx.permissions.has('event:write')) throw new Error('Forbidden');
  validateEventInput(input);
  if (!deps.events.create) throw new Error('Event creation unavailable');
  return deps.events.create(ctx, input);
}
export async function updateEvent(
  ctx: RequestContext,
  eventId: string,
  patch: EventPatch,
  deps: { events: EventRepository },
): Promise<Event | null> {
  if (!ctx.permissions.has('event:write')) throw new Error('Forbidden');
  const current = await deps.events.getById(ctx, eventId);
  if (!current) return null;
  validateEventInput(patch, true);
  validateEventInput({ ...current, ...patch });
  if (!deps.events.update) throw new Error('Event updates unavailable');
  return deps.events.update(ctx, eventId, patch);
}
export async function transitionEvent(
  ctx: RequestContext,
  eventId: string,
  status: EventStatus,
  now: Date,
  deps: { events: EventRepository },
): Promise<Event | null> {
  if (!ctx.permissions.has('event:write')) throw new Error('Forbidden');
  const event = await deps.events.getById(ctx, eventId);
  if (!event) return null;
  assertEventTransition(event.status, status);
  if (!deps.events.transition) throw new Error('Event transitions unavailable');
  return deps.events.transition(ctx, eventId, event.status, status, now);
}
function validateEventInput(
  input: EventInput | EventPatch,
  partial = false,
): void {
  if (
    (!partial || 'slug' in input) &&
    (!input.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug))
  )
    throw new Error('Invalid event slug');
  if (
    (!partial || 'name' in input) &&
    (!input.name?.trim() || input.name.length > 160)
  )
    throw new Error('Invalid event name');
  if (
    (!partial || 'startsOn' in input) &&
    (!input.startsOn || Number.isNaN(Date.parse(input.startsOn)))
  )
    throw new Error('Invalid event start date');
  if (
    (!partial || 'endsOn' in input) &&
    (!input.endsOn || Number.isNaN(Date.parse(input.endsOn)))
  )
    throw new Error('Invalid event end date');
  const start = input.startsOn;
  const end = input.endsOn;
  if (start && end && end < start)
    throw new Error('Event end date precedes start date');
  for (const key of ['registrationOpensAt', 'registrationClosesAt'] as const) {
    const value = input[key];
    if (
      value !== undefined &&
      value !== null &&
      (!Number.isFinite(Date.parse(value)) || !/[+-]\d\d:\d\d$|Z$/i.test(value))
    )
      throw new Error(`Invalid ${key}`);
  }
  const opens = input.registrationOpensAt;
  const closes = input.registrationClosesAt;
  if (opens && closes && Date.parse(closes) < Date.parse(opens))
    throw new Error('Registration close precedes open');
}
export async function getPublicEvent(
  ctx: RequestContext,
  slug: string,
  now: Date,
  deps: { events: EventRepository },
): Promise<(Event & { classes: EventClass[] }) | null> {
  const event = (await deps.events.getPublicBySlug?.(ctx, slug, now)) ?? null;
  return event &&
    event.status === 'open' &&
    event.classes.some((item) => canRegister(event, item, now))
    ? event
    : null;
}
export async function createEventClass(
  ctx: RequestContext,
  eventId: string,
  input: EventClassInput,
  deps: { events: EventRepository; classes: EventClassRepository },
): Promise<EventClass> {
  if (!ctx.permissions.has('class:write')) throw new Error('Forbidden');
  validateClass(input);
  if (!(await deps.events.getById(ctx, eventId))) throw new Error('Not found');
  return deps.classes.create(ctx, eventId, input);
}
export async function updateEventClass(
  ctx: RequestContext,
  eventId: string,
  classId: string,
  patch: Partial<EventClassInput>,
  deps: { events: EventRepository; classes: EventClassRepository },
): Promise<EventClass | null> {
  if (!ctx.permissions.has('class:write')) throw new Error('Forbidden');
  if (!(await deps.events.getById(ctx, eventId))) return null;
  validateClass(patch, true);
  return deps.classes.update(ctx, eventId, classId, patch);
}
function validateClass(input: Partial<EventClassInput>, partial = false): void {
  if (
    (!partial || 'name' in input) &&
    (!input.name?.trim() || input.name.length > 120)
  )
    throw new Error('Invalid class name');
  if (
    (!partial || 'code' in input) &&
    (!input.code || input.code.length > 24 || !/^[A-Z0-9-]+$/.test(input.code))
  )
    throw new Error('Invalid class code');
  if (
    input.vehicleType !== undefined &&
    !['car', 'motorcycle', 'kart', 'other'].includes(input.vehicleType)
  )
    throw new Error('Invalid vehicle type');
  if (
    input.sortOrder !== undefined &&
    (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)
  )
    throw new Error('Invalid sort order');
  if (
    input.maxParticipants !== undefined &&
    input.maxParticipants !== null &&
    (!Number.isInteger(input.maxParticipants) || input.maxParticipants < 1)
  )
    throw new Error('Invalid participant limit');
}
export interface OrganizationDependencies {
  organizations: OrganizationRepository;
}
function validatePatch(patch: OrganizationPatch): void {
  if (
    'name' in patch &&
    (typeof patch.name !== 'string' ||
      patch.name.trim().length === 0 ||
      patch.name.length > 160)
  )
    throw new Error('Invalid organization name');
  if (
    'contactEmail' in patch &&
    patch.contactEmail !== null &&
    (typeof patch.contactEmail !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.contactEmail))
  )
    throw new Error('Invalid contact email');
  if ('websiteUrl' in patch && patch.websiteUrl !== null) {
    try {
      const u = new URL(patch.websiteUrl);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    } catch {
      throw new Error('Invalid website URL');
    }
  }
  if ('timezone' in patch && typeof patch.timezone === 'string') {
    try {
      new Intl.DateTimeFormat('en', { timeZone: patch.timezone });
    } catch {
      throw new Error('Invalid timezone');
    }
  }
  if (
    'currency' in patch &&
    (typeof patch.currency !== 'string' || !/^[A-Z]{3}$/.test(patch.currency))
  )
    throw new Error('Invalid currency');
  if ('locale' in patch && typeof patch.locale === 'string') {
    try {
      Intl.getCanonicalLocales(patch.locale);
    } catch {
      throw new Error('Invalid locale');
    }
  }
}
export async function getOrganization(
  ctx: RequestContext,
  deps: OrganizationDependencies,
): Promise<Organization | null> {
  if (!ctx.permissions.has('organization:read')) throw new Error('Forbidden');
  return deps.organizations.getById(ctx);
}
export async function updateOrganization(
  ctx: RequestContext,
  patch: OrganizationPatch,
  deps: OrganizationDependencies,
): Promise<Organization | null> {
  if (!ctx.permissions.has('organization:update')) throw new Error('Forbidden');
  validatePatch(patch);
  return deps.organizations.update(ctx, patch);
}

/** Stable provider failures; messages must never contain credentials or tenant data. */
export type ProviderErrorCode =
  | 'not_configured'
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'unavailable'
  | 'conflict'
  | 'internal';
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}
export interface ExternalIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly displayName?: string;
}
/** Verifies credentials but does not grant roles or permissions. */
export interface IdentityProvider {
  verify(credential: string): Promise<ExternalIdentity>;
}
export type MembershipRole = 'admin' | 'member';
export interface MembershipBootstrap {
  readonly issuer: string;
  readonly subject?: string;
  readonly email?: string;
}
export interface MembershipRepository {
  resolvePermissions(
    identity: ExternalIdentity,
    organizationId: OrganizationId,
    bootstrap?: MembershipBootstrap,
  ): Promise<ReadonlySet<string>>;
}
export function permissionsForRole(role: MembershipRole): ReadonlySet<string> {
  return role === 'admin'
    ? new Set([
        'organization:read',
        'organization:update',
        'event:read',
        'event:write',
        'class:write',
        'entry:read',
        'entry:write',
        'payment:read',
        'payment:write',
        'timing:record',
        'timing:correct',
        'timing:publish',
        'timing:read',
        'role:admin',
      ])
    : new Set(['role:member']);
}
export interface MailMessage {
  readonly organizationId: OrganizationId;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly idempotencyKey: string;
  readonly from?: string;
  readonly replyTo?: string;
}
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
export interface StoredObjectRef {
  readonly organizationId: OrganizationId;
  readonly objectId: string;
  readonly contentType: string;
  readonly size: number;
  readonly sha256: string;
}
export interface StoredObject {
  readonly ref: StoredObjectRef;
  readonly body: Uint8Array;
}
/** Object identifiers are issued by the adapter; callers never supply paths/keys. */
export interface ObjectStorageProvider {
  put(input: {
    readonly organizationId: OrganizationId;
    readonly body: Uint8Array;
    readonly contentType: string;
  }): Promise<StoredObjectRef>;
  get(
    organizationId: OrganizationId,
    objectId: string,
  ): Promise<StoredObject | null>;
  delete(organizationId: OrganizationId, objectId: string): Promise<void>;
}

/** Executable, provider-neutral assertions shared by adapter contract tests. */
export async function verifyObjectStorageContract(
  storage: ObjectStorageProvider,
): Promise<void> {
  const owner = organizationId('contract_org_a');
  const foreign = organizationId('contract_org_b');
  const body = new TextEncoder().encode('storage port contract');
  const ref = await storage.put({
    organizationId: owner,
    body,
    contentType: 'text/plain',
  });
  if (
    !/^[0-9a-f-]{36}$/.test(ref.objectId) ||
    ref.organizationId !== owner ||
    ref.size !== body.length ||
    !/^[a-f0-9]{64}$/.test(ref.sha256)
  )
    throw new Error('Storage put contract failed');
  const result = await storage.get(owner, ref.objectId);
  if (
    !result ||
    result.ref.sha256 !== ref.sha256 ||
    result.ref.contentType !== ref.contentType ||
    result.body.length !== body.length ||
    result.body.some((value, index) => value !== body[index])
  )
    throw new Error('Storage get contract failed');
  if ((await storage.get(foreign, ref.objectId)) !== null)
    throw new Error('Foreign organization must not read object');
  let rejected = false;
  try {
    await storage.get(owner, '../etc/passwd');
  } catch (error) {
    rejected = error instanceof ProviderError && error.code === 'invalid_input';
  }
  if (!rejected) throw new Error('Invalid object identifier must be rejected');
  await storage.delete(owner, ref.objectId);
  if ((await storage.get(owner, ref.objectId)) !== null)
    throw new Error('Deleted object must not be returned');
}

export type EntryVerificationStatus = 'unverified' | 'verified';
export type EntryAcceptanceStatus = string;
export const entryStatusMeanings = [
  'new',
  'in_progress',
  'missing',
  'done',
  'rejected',
  'not_relevant',
] as const;
export type EntryStatusMeaning = (typeof entryStatusMeanings)[number];
export const entryWorkflowCategories = [
  'pending',
  'accepted',
  'rejected',
  'waitlisted',
  'withdrawn',
] as const;
export type EntryWorkflowCategory = (typeof entryWorkflowCategories)[number];
export interface EntryWorkflowStatus {
  readonly key: string;
  readonly labels: { readonly de: string; readonly en: string };
  readonly color: string;
  readonly category: EntryWorkflowCategory;
  /** Fixed NENNBOX semantic; optional only for old persisted workflow revisions. */
  readonly meaning?: EntryStatusMeaning;
}
export interface EntryWorkflowTransition {
  readonly from: string;
  readonly to: string;
  readonly reasonRequired: boolean;
  readonly permission?: string;
  readonly roles?: readonly MembershipRole[];
  readonly notify?: boolean;
}
export interface EntryWorkflow {
  readonly version: number;
  readonly statuses: readonly EntryWorkflowStatus[];
  readonly transitions: readonly EntryWorkflowTransition[];
}
export interface EntryWorkflowRevision {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly eventId: string | null;
  readonly workflow: EntryWorkflow;
  readonly version: number;
}
export interface EntryWorkflowRepository {
  getOrganization(ctx: RequestContext): Promise<EntryWorkflowRevision | null>;
  getEffective(
    ctx: RequestContext,
    eventId: string,
  ): Promise<EntryWorkflowRevision | null>;
  getPinnedForEntry(
    ctx: RequestContext,
    entryId: string,
  ): Promise<EntryWorkflowRevision | null>;
  setOrganization(
    ctx: RequestContext,
    workflow: EntryWorkflow,
    actor: string,
    reason: string,
  ): Promise<EntryWorkflowRevision>;
  setEvent(
    ctx: RequestContext,
    eventId: string,
    workflow: EntryWorkflow,
    actor: string,
    reason: string,
  ): Promise<EntryWorkflowRevision | null>;
}
export interface EntryStatusDimensionRepository {
  getEvent(
    ctx: RequestContext,
    eventId: string,
  ): Promise<EntryStatusDimensionConfig | null>;
  setEvent(
    ctx: RequestContext,
    eventId: string,
    config: EntryStatusDimensionConfig,
    actor: string,
    reason: string,
  ): Promise<EntryStatusDimensionConfig | null>;
  transition(
    ctx: RequestContext,
    entryId: string,
    dimension: 'technical_inspection' | 'waiver',
    to: string,
    actor: string,
    reason: string,
  ): Promise<boolean | null>;
  updateHints(
    ctx: RequestContext,
    entryId: string,
    hints: Partial<Record<EntryStatusHintKey, boolean>>,
    actor: string,
    reason: string,
  ): Promise<boolean>;
}
export class EntryStatusInUseError extends Error {
  readonly dimension: EntryStatusDimensionKey;
  readonly status: string;

  constructor(dimension: EntryStatusDimensionKey, status: string) {
    super(`Cannot remove in-use status ${dimension}.${status}`);
    this.name = 'EntryStatusInUseError';
    this.dimension = dimension;
    this.status = status;
  }
}
export const defaultEntryWorkflow: EntryWorkflow = Object.freeze<EntryWorkflow>(
  {
    version: 1,
    statuses: [
      {
        key: 'pending',
        labels: { de: 'Ausstehend', en: 'Pending' },
        color: '#64748b',
        category: 'pending',
        meaning: 'new',
      },
      {
        key: 'accepted',
        labels: { de: 'Angenommen', en: 'Accepted' },
        color: '#15803d',
        category: 'accepted',
        meaning: 'done',
      },
      {
        key: 'rejected',
        labels: { de: 'Abgelehnt', en: 'Rejected' },
        color: '#b91c1c',
        category: 'rejected',
        meaning: 'rejected',
      },
      {
        key: 'waitlisted',
        labels: { de: 'Warteliste', en: 'Waitlisted' },
        color: '#a16207',
        category: 'waitlisted',
        meaning: 'in_progress',
      },
      {
        key: 'withdrawn',
        labels: { de: 'Zurückgezogen', en: 'Withdrawn' },
        color: '#475569',
        category: 'withdrawn',
        meaning: 'not_relevant',
      },
    ],
    transitions: [
      ...['accepted', 'rejected', 'waitlisted', 'withdrawn'].map((to) => ({
        from: 'pending',
        to,
        reasonRequired: false,
      })),
      ...['accepted', 'rejected'].map((from) => ({
        from,
        to: 'withdrawn',
        reasonRequired: false,
      })),
      { from: 'waitlisted', to: 'accepted', reasonRequired: false },
      { from: 'waitlisted', to: 'rejected', reasonRequired: false },
      { from: 'waitlisted', to: 'withdrawn', reasonRequired: false },
    ],
  },
);

const defaultMeaningByCategory: Readonly<
  Record<EntryWorkflowCategory, EntryStatusMeaning>
> = Object.freeze({
  pending: 'new',
  accepted: 'done',
  rejected: 'rejected',
  waitlisted: 'in_progress',
  withdrawn: 'not_relevant',
});

/** Add stable semantics to legacy revisions while preserving their legacy color field. */
export function normalizeEntryWorkflow(workflow: EntryWorkflow): EntryWorkflow {
  return {
    ...workflow,
    statuses: workflow.statuses.map((status) => {
      const meaning =
        status.meaning ?? defaultMeaningByCategory[status.category];
      return {
        ...status,
        meaning,
      };
    }),
  };
}

export const entryStatusDimensionKeys = [
  'payment',
  'technical_inspection',
  'waiver',
  'email_verification',
] as const;
export type EntryStatusDimensionKey = (typeof entryStatusDimensionKeys)[number];
export interface EntryStatusValue {
  readonly key: string;
  readonly labels: { readonly de: string; readonly en: string };
  readonly meaning: EntryStatusMeaning;
}
export interface EntryStatusDimensionDefinition {
  readonly key: EntryStatusDimensionKey;
  readonly required: boolean;
  readonly values: readonly EntryStatusValue[];
  readonly transitions: readonly {
    readonly from: string;
    readonly to: string;
  }[];
}
export interface EntryStatusDimensionConfig {
  readonly version: 1;
  readonly dimensions: readonly EntryStatusDimensionDefinition[];
}
const statusValue = (
  key: string,
  de: string,
  en: string,
  meaning: EntryStatusMeaning,
): EntryStatusValue => ({ key, labels: { de, en }, meaning });
export const defaultEntryStatusDimensionConfig: EntryStatusDimensionConfig =
  Object.freeze<EntryStatusDimensionConfig>({
    version: 1,
    dimensions: [
      {
        key: 'payment',
        required: true,
        values: [
          statusValue('open', 'Offen', 'Open', 'missing'),
          statusValue(
            'partially_paid',
            'Teilweise bezahlt',
            'Partially paid',
            'missing',
          ),
          statusValue('paid', 'Bezahlt', 'Paid', 'done'),
          statusValue(
            'not_required',
            'Keine erforderlich',
            'Not required',
            'not_relevant',
          ),
          statusValue(
            'not_relevant',
            'Nicht relevant',
            'Not relevant',
            'not_relevant',
          ),
        ],
        transitions: [],
      },
      {
        key: 'technical_inspection',
        required: true,
        values: [
          statusValue('pending', 'Ausstehend', 'Pending', 'missing'),
          statusValue(
            'reinspection',
            'Nachprüfung',
            'Reinspection',
            'in_progress',
          ),
          statusValue('passed', 'Bestanden', 'Passed', 'done'),
          statusValue(
            'not_relevant',
            'Nicht relevant',
            'Not relevant',
            'not_relevant',
          ),
        ],
        transitions: [
          { from: 'pending', to: 'reinspection' },
          { from: 'pending', to: 'passed' },
          { from: 'pending', to: 'not_relevant' },
          { from: 'reinspection', to: 'passed' },
          { from: 'reinspection', to: 'not_relevant' },
        ],
      },
      {
        key: 'waiver',
        required: true,
        values: [
          statusValue('f_pending', 'F · Ausstehend', 'F · Pending', 'missing'),
          statusValue('f_signed', 'F · Unterschrieben', 'F · Signed', 'done'),
          statusValue(
            'bf_signed',
            'BF · Unterschrieben',
            'BF · Signed',
            'done',
          ),
          statusValue(
            'not_relevant',
            'Nicht relevant',
            'Not relevant',
            'not_relevant',
          ),
        ],
        transitions: [
          { from: 'f_pending', to: 'f_signed' },
          { from: 'f_pending', to: 'bf_signed' },
          { from: 'f_pending', to: 'not_relevant' },
        ],
      },
      {
        key: 'email_verification',
        required: true,
        values: [
          statusValue('unverified', 'Unbestätigt', 'Unverified', 'missing'),
          statusValue('verified', 'Verifiziert', 'Verified', 'done'),
        ],
        transitions: [],
      },
    ],
  });

export function validateEntryStatusDimensionConfig(
  config: EntryStatusDimensionConfig,
): string[] {
  const errors: string[] = [];
  if (config.version !== 1) errors.push('Unsupported status dimension version');
  const dimensions = new Set<EntryStatusDimensionKey>();
  for (const definition of config.dimensions) {
    if (!entryStatusDimensionKeys.includes(definition.key)) {
      errors.push(`Unknown status dimension: ${definition.key}`);
      continue;
    }
    if (dimensions.has(definition.key))
      errors.push(`Duplicate status dimension: ${definition.key}`);
    dimensions.add(definition.key);
    const values = new Set<string>();
    for (const value of definition.values) {
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(value.key) || values.has(value.key))
        errors.push(
          `Invalid or duplicate ${definition.key} value: ${value.key}`,
        );
      values.add(value.key);
      if (!entryStatusMeanings.includes(value.meaning))
        errors.push(`Invalid meaning for ${definition.key}.${value.key}`);
      if (!value.labels.de.trim() || !value.labels.en.trim())
        errors.push(`Missing labels for ${definition.key}.${value.key}`);
    }
    const edges = new Set<string>();
    for (const transition of definition.transitions) {
      const edge = `${transition.from}\0${transition.to}`;
      if (!values.has(transition.from) || !values.has(transition.to))
        errors.push(`Unknown ${definition.key} transition value`);
      if (edges.has(edge))
        errors.push(`Duplicate ${definition.key} transition`);
      edges.add(edge);
    }
    if (
      definition.key === 'payment' ||
      definition.key === 'email_verification'
    ) {
      if (definition.transitions.length)
        errors.push(
          `${definition.key} is derived and cannot define transitions`,
        );
    }
  }
  for (const key of entryStatusDimensionKeys)
    if (!dimensions.has(key)) errors.push(`Missing status dimension: ${key}`);
  const requiredValues: Partial<
    Record<EntryStatusDimensionKey, readonly string[]>
  > = {
    payment: ['open', 'partially_paid', 'paid', 'not_required', 'not_relevant'],
    email_verification: ['unverified', 'verified'],
    technical_inspection: ['pending', 'reinspection', 'passed', 'not_relevant'],
    waiver: ['f_pending', 'f_signed', 'bf_signed', 'not_relevant'],
  };
  for (const definition of config.dimensions) {
    const keys = new Set(definition.values.map(({ key }) => key));
    for (const key of requiredValues[definition.key] ?? [])
      if (!keys.has(key))
        errors.push(`Missing required ${definition.key} value: ${key}`);
  }
  return [...new Set(errors)];
}

export interface EntryStatusDimensionProjection {
  readonly key: 'entry' | EntryStatusDimensionKey;
  readonly value: string;
  readonly label: { readonly de: string; readonly en: string };
  readonly meaning: EntryStatusMeaning;
  readonly required: boolean;
  readonly nextAction: {
    readonly key: string;
    readonly label: { readonly de: string; readonly en: string };
  } | null;
}
export interface EntryStatusProjection {
  readonly dimensions: readonly EntryStatusDimensionProjection[];
  readonly documents: { readonly complete: number; readonly total: number };
  readonly hints: readonly EntryStatusHint[];
}
export type EntryStatusHintKey = 'double_starter' | 'passenger' | 'late_entry';
export interface EntryStatusHint {
  readonly key: EntryStatusHintKey;
  readonly present: boolean;
}

/** Produces status meaning and actionable summaries without making hints into statuses. */
export function projectEntryStatuses(input: {
  readonly workflow: EntryWorkflow;
  readonly acceptanceStatus: string;
  readonly paymentStatus: string;
  readonly technicalStatus: string;
  readonly waiverStatus: string;
  readonly emailStatus: string;
  readonly config: EntryStatusDimensionConfig;
  readonly hints?: Partial<Record<EntryStatusHintKey, boolean>>;
}): EntryStatusProjection {
  const config = new Map(
    input.config.dimensions.map((item) => [item.key, item]),
  );
  const workflow = normalizeEntryWorkflow(input.workflow);
  const entryStatus = workflow.statuses.find(
    (item) => item.key === input.acceptanceStatus,
  );
  if (!entryStatus)
    throw new Error(`Unknown entry status: ${input.acceptanceStatus}`);
  const pick = (key: EntryStatusDimensionKey, valueKey: string) => {
    const definition = config.get(key);
    const value = definition?.values.find((item) => item.key === valueKey);
    if (!definition || !value)
      throw new Error(`Unknown ${key} status: ${valueKey}`);
    return { definition, value };
  };
  const entryTransitions = workflow.transitions.filter(
    (edge) => edge.from === input.acceptanceStatus,
  );
  const dimensions: EntryStatusDimensionProjection[] = [
    {
      key: 'entry',
      value: entryStatus.key,
      label: entryStatus.labels,
      meaning: entryStatus.meaning!,
      required: true,
      nextAction: entryTransitions[0]
        ? {
            key: `entry:${entryTransitions[0].to}`,
            label: {
              de: `Status auf ${workflow.statuses.find((s) => s.key === entryTransitions[0]!.to)?.labels.de ?? entryTransitions[0].to} setzen`,
              en: `Set status to ${workflow.statuses.find((s) => s.key === entryTransitions[0]!.to)?.labels.en ?? entryTransitions[0].to}`,
            },
          }
        : null,
    },
    ...(
      [
        'payment',
        'technical_inspection',
        'waiver',
        'email_verification',
      ] as const
    ).map((key) => {
      const actual = {
        payment: input.paymentStatus,
        technical_inspection: input.technicalStatus,
        waiver: input.waiverStatus,
        email_verification: input.emailStatus,
      }[key];
      const { definition, value } = pick(key, actual);
      const edge = definition.transitions.find(
        (transition) => transition.from === actual,
      );
      const actionLabels: Partial<
        Record<EntryStatusDimensionKey, { de: string; en: string }>
      > = {
        payment: { de: 'Zahlung erfassen', en: 'Record payment' },
        technical_inspection: {
          de: 'Technische Abnahme durchführen',
          en: 'Perform technical inspection',
        },
        waiver: { de: 'Haftverzicht einholen', en: 'Collect waiver' },
        email_verification: { de: 'E-Mail verifizieren', en: 'Verify email' },
      };
      return {
        key,
        value: actual,
        label: value.labels,
        meaning: value.meaning,
        required: definition.required,
        nextAction: edge
          ? {
              key: `${key}:${edge.to}`,
              label: actionLabels[key] ?? value.labels,
            }
          : key === 'payment' && ['open', 'partially_paid'].includes(actual)
            ? { key: 'payment:record', label: actionLabels.payment! }
            : key === 'email_verification' && actual === 'unverified'
              ? {
                  key: 'email_verification:verify',
                  label: actionLabels.email_verification!,
                }
              : null,
      };
    }),
  ];
  const documents = dimensions.filter(
    (item) =>
      (item.key === 'technical_inspection' || item.key === 'waiver') &&
      item.required,
  );
  const hints = (['double_starter', 'passenger', 'late_entry'] as const).map(
    (key) => ({
      key,
      present: input.hints?.[key] === true,
    }),
  );
  return {
    dimensions,
    documents: {
      complete: documents.filter(
        (item) => item.meaning === 'done' || item.meaning === 'not_relevant',
      ).length,
      total: documents.length,
    },
    hints,
  };
}
export function validateEntryWorkflow(workflow: EntryWorkflow): string[] {
  const errors: string[] = [],
    keys = new Set<string>(),
    edges = new Map<string, string[]>(),
    pairs = new Set<string>();
  for (const status of workflow.statuses) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(status.key) || keys.has(status.key))
      errors.push(`Invalid or duplicate status key: ${status.key}`);
    keys.add(status.key);
    if (!entryWorkflowCategories.includes(status.category))
      errors.push(`Invalid category: ${status.category}`);
    if (
      status.meaning !== undefined &&
      !entryStatusMeanings.includes(status.meaning)
    )
      errors.push(`Invalid meaning: ${status.key}`);
    if (!/^#[0-9a-f]{6}$/i.test(status.color))
      errors.push(`Invalid color: ${status.key}`);
    if (!status.labels.de.trim() || !status.labels.en.trim())
      errors.push(`Missing localized label: ${status.key}`);
  }
  if (
    !workflow.statuses.some(
      (status) => status.key === 'pending' && status.category === 'pending',
    )
  )
    errors.push('Workflow must include the pending system status');
  if (!Number.isInteger(workflow.version) || workflow.version < 1)
    errors.push('Invalid workflow version');
  for (const edge of workflow.transitions) {
    if (!keys.has(edge.from) || !keys.has(edge.to))
      errors.push(`Orphan transition: ${edge.from} -> ${edge.to}`);
    const pair = `${edge.from}\0${edge.to}`;
    if (typeof edge.reasonRequired !== 'boolean')
      errors.push(`Invalid reason requirement: ${edge.from} -> ${edge.to}`);
    if (
      edge.permission !== undefined &&
      (typeof edge.permission !== 'string' ||
        !/^[a-z][a-z0-9:._-]{0,99}$/.test(edge.permission))
    )
      errors.push(`Invalid permission: ${edge.from} -> ${edge.to}`);
    if (pairs.has(pair))
      errors.push(`Duplicate transition: ${edge.from} -> ${edge.to}`);
    pairs.add(pair);
    edges.set(edge.from, [...(edges.get(edge.from) ?? []), edge.to]);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) {
      errors.push('Workflow transitions must be acyclic');
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const next of edges.get(key) ?? []) visit(next);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of keys) visit(key);
  const start = 'pending';
  const reachable = new Set<string>();
  const walk = (key: string): void => {
    if (reachable.has(key)) return;
    reachable.add(key);
    for (const next of edges.get(key) ?? []) walk(next);
  };
  if (start) walk(start);
  for (const category of entryWorkflowCategories)
    if (
      !workflow.statuses.some(
        (status) => status.category === category && reachable.has(status.key),
      )
    )
      errors.push(`Unreachable category: ${category}`);
  if ([...keys].some((key) => !reachable.has(key)))
    errors.push('Workflow contains unreachable statuses');
  return [...new Set(errors)];
}
export function assertWorkflowTransition(
  workflow: EntryWorkflow,
  from: string,
  to: string,
  reason: string,
): void {
  const edge = workflow.transitions.find(
    (item) => item.from === from && item.to === to,
  );
  if (!edge)
    throw new Error(`Invalid entry acceptance transition: ${from} -> ${to}`);
  if (edge.reasonRequired && !reason.trim())
    throw new Error('Transition reason is required');
}
export interface Person {
  id: string;
  organizationId: OrganizationId;
  firstName: string;
  lastName: string;
  email: string | null;
  emailNormalized: string | null;
  dateOfBirth: string | null;
  createdAt: string;
  deletedAt: string | null;
  deletionReason: string | null;
}
export interface Vehicle {
  id: string;
  organizationId: OrganizationId;
  make: string;
  model: string;
  year: number | null;
  registration: string | null;
  createdAt: string;
  deletedAt: string | null;
  deletionReason: string | null;
}
export interface RegistrationGroup {
  id: string;
  organizationId: OrganizationId;
  eventId: string;
  personId: string;
  createdAt: string;
}
export interface Entry {
  id: string;
  organizationId: OrganizationId;
  eventId: string;
  classId: string;
  registrationGroupId: string;
  driverPersonId: string;
  vehicleId: string;
  verificationStatus: EntryVerificationStatus;
  acceptanceStatus: EntryAcceptanceStatus;
  requestedStartNumber: string | null;
  priceSnapshotVersion: string | null;
  formSnapshotVersion: string | null;
  priceSnapshot?: PriceSnapshot | null;
  createdAt: string;
  deletedAt: string | null;
  deletionReason: string | null;
  /** Read-model fields computed from the pinned workflow, event configuration and source records. */
  adminDetails?: {
    driver: {
      name: string;
      dateOfBirth: string | null;
      country: string | null;
      email: string | null;
      emailVerified: boolean;
    };
    vehicle: { make: string; model: string; year: number | null };
    eventClass: { code: string; name: string };
    startNumber: string | null;
  };
  statusProjection?: EntryStatusProjection;
}
export interface EntryAuditEvent {
  id: string;
  organizationId: OrganizationId;
  entryId: string;
  transition: 'verification' | 'acceptance';
  fromStatus: string;
  toStatus: string;
  actor: string;
  reason: string;
  occurredAt: string;
}
export type PersonInput = Pick<
  Person,
  'firstName' | 'lastName' | 'email' | 'dateOfBirth'
>;
export type VehicleInput = Pick<
  Vehicle,
  'make' | 'model' | 'year' | 'registration'
>;
export type RegistrationGroupInput = Pick<
  RegistrationGroup,
  'eventId' | 'personId'
>;
export type EntryInput = Pick<
  Entry,
  | 'eventId'
  | 'classId'
  | 'registrationGroupId'
  | 'driverPersonId'
  | 'vehicleId'
  | 'requestedStartNumber'
  | 'priceSnapshotVersion'
  | 'priceSnapshot'
  | 'formSnapshotVersion'
>;
export interface PersonRepository {
  create?(ctx: RequestContext, input: PersonInput): Promise<Person>;
  getById(ctx: RequestContext, id: string): Promise<Person | null>;
  softDelete(
    ctx: RequestContext,
    id: string,
    reason: string,
  ): Promise<Person | null>;
  findDuplicate(
    ctx: RequestContext,
    email: string | null,
    firstName: string,
    lastName: string,
    dateOfBirth: string | null,
  ): Promise<{ person: Person | null; nameAndBirthdateMatch: boolean }>;
}
export interface VehicleRepository {
  create?(ctx: RequestContext, input: VehicleInput): Promise<Vehicle>;
  getById(ctx: RequestContext, id: string): Promise<Vehicle | null>;
  softDelete(
    ctx: RequestContext,
    id: string,
    reason: string,
  ): Promise<Vehicle | null>;
}
export interface RegistrationGroupRepository {
  create(
    ctx: RequestContext,
    input: RegistrationGroupInput,
  ): Promise<RegistrationGroup>;
}
export interface EntryExportRow {
  readonly driver: string;
  readonly vehicle: string;
  readonly class: string;
  readonly startNumber: string | null;
  readonly status: EntryAcceptanceStatus;
  readonly priceCents: number | null;
}
export interface EntryExportRepository {
  listByEvent(
    ctx: RequestContext,
    eventId: string,
  ): Promise<readonly EntryExportRow[]>;
}

export interface EntryConfirmationData {
  readonly eventId: string;
  readonly eventName: string;
  readonly eventStartsOn: string;
  readonly registrationGroupId: string;
  readonly driverName: string;
  readonly vehicles: readonly string[];
  readonly classes: readonly string[];
  readonly priceSnapshot: PriceSnapshot;
  readonly paymentReference: string;
}
export interface EntryConfirmationRepository {
  getByGroup(
    ctx: RequestContext,
    eventId: string,
    registrationGroupId: string,
  ): Promise<EntryConfirmationData | null>;
}
export type ArtifactKind = 'confirmation_pdf' | 'entries_csv';
export type ArtifactStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface ArtifactJob {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly eventId: string;
  readonly kind: ArtifactKind;
  readonly registrationGroupId: string | null;
  readonly fields: readonly string[];
  readonly idempotencyKey: string;
  readonly status: ArtifactStatus;
  readonly objectId: string | null;
  readonly sha256: string | null;
  readonly contentType: string | null;
  readonly attempts: number;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ArtifactJobRepository {
  enqueue(
    ctx: RequestContext,
    input: {
      eventId: string;
      kind: ArtifactKind;
      registrationGroupId?: string;
      fields?: readonly string[];
      idempotencyKey: string;
    },
  ): Promise<ArtifactJob>;
  getById(ctx: RequestContext, id: string): Promise<ArtifactJob | null>;
  claim(
    ctx: JobContext,
    id: string,
  ): Promise<(ArtifactJob & { claimToken: string }) | null>;
  release(ctx: JobContext, id: string, claimToken: string): Promise<void>;
  complete(
    ctx: JobContext,
    id: string,
    claimToken: string,
    ref: StoredObjectRef,
  ): Promise<void>;
  fail(
    ctx: JobContext,
    id: string,
    claimToken: string,
    error: string,
  ): Promise<void>;
}
export interface EntryRepository {
  create?(
    ctx: RequestContext,
    input: EntryInput,
    executor?: unknown,
  ): Promise<Entry>;
  getById(ctx: RequestContext, id: string): Promise<Entry | null>;
  listAdmin?(
    ctx: RequestContext,
    query: EntryListQuery,
  ): Promise<{ items: Entry[]; total: number }>;
  transition(
    ctx: RequestContext,
    id: string,
    transition: 'verification' | 'acceptance',
    fromStatus: string,
    toStatus: string,
    actor: string,
    reason: string,
    workflow?: {
      statusCategory: EntryWorkflowCategory;
      workflowRevisionId: string;
      notification?: {
        statusKey: string;
        statusLabelDe: string;
        statusLabelEn: string;
      };
    },
  ): Promise<Entry | null>;
  softDelete(
    ctx: RequestContext,
    id: string,
    reason: string,
  ): Promise<Entry | null>;
}
export interface EntryListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly eventId?: string;
  readonly classId?: string;
  readonly acceptanceStatus?: EntryAcceptanceStatus;
  readonly verificationStatus?: EntryVerificationStatus;
  readonly search?: string;
  readonly sort:
    | 'createdAt'
    | 'requestedStartNumber'
    | 'acceptanceStatus'
    | 'verificationStatus';
  readonly direction: 'asc' | 'desc';
}
export function normalizeEmail(value: string): string {
  const normalized = value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error('Invalid email');
  return normalized;
}
export function normalizeRequestedStartNumber(
  value: string | null | undefined,
): string | null {
  if (value == null || value.trim() === '') return null;
  const normalized = value.trim().normalize('NFKC').toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(normalized))
    throw new Error('Invalid requested start number');
  return normalized;
}
const verificationTransitions: Record<
  EntryVerificationStatus,
  readonly EntryVerificationStatus[]
> = { unverified: ['verified'], verified: [] };
const acceptanceTransitions: Record<
  EntryAcceptanceStatus,
  readonly EntryAcceptanceStatus[]
> = {
  pending: ['accepted', 'rejected', 'waitlisted', 'withdrawn'],
  accepted: ['withdrawn'],
  rejected: ['withdrawn'],
  // Manual promotion from the waitlist; automatic waitlist handling is #29.
  waitlisted: ['accepted', 'rejected', 'withdrawn'],
  withdrawn: [],
};
export function assertEntryTransition(
  kind: 'verification' | 'acceptance',
  from: string,
  to: string,
): void {
  const allowed =
    kind === 'verification'
      ? verificationTransitions[from as EntryVerificationStatus]
      : acceptanceTransitions[from as EntryAcceptanceStatus];
  if (!allowed?.includes(to as never))
    throw new Error(`Invalid entry ${kind} transition: ${from} -> ${to}`);
}
export async function transitionEntry(
  ctx: RequestContext,
  id: string,
  kind: 'verification' | 'acceptance',
  to: string,
  actor: string,
  reason: string,
  deps: { entries: EntryRepository; workflows?: EntryWorkflowRepository },
): Promise<Entry | null> {
  // Workflow role claims may further restrict entry writers, but must never
  // grant tenant-wide write access to entries.
  if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
  if (!actor.trim()) throw new Error('Transition actor is required');
  const current = await deps.entries.getById(ctx, id);
  if (!current) return null;
  const from =
    kind === 'verification'
      ? current.verificationStatus
      : current.acceptanceStatus;
  let statusCategory: EntryWorkflowCategory | undefined;
  let workflowRevisionId: string | undefined;
  let notification:
    | { statusKey: string; statusLabelDe: string; statusLabelEn: string }
    | undefined;
  if (kind === 'acceptance' && deps.workflows) {
    const pinned = await deps.workflows.getPinnedForEntry(ctx, id);
    if (!pinned) return null;
    assertWorkflowTransition(pinned.workflow, from, to, reason);
    const workflowEdge = pinned.workflow.transitions.find(
      (edge) => edge.from === from && edge.to === to,
    )!;
    if (
      workflowEdge.roles?.length &&
      !workflowEdge.roles.some((role) => ctx.permissions.has(`role:${role}`))
    )
      throw new Error('Forbidden');
    if (
      workflowEdge.permission &&
      !ctx.permissions.has(workflowEdge.permission)
    )
      throw new Error('Forbidden');
    statusCategory = pinned.workflow.statuses.find(
      (status) => status.key === to,
    )?.category;
    if (!statusCategory) throw new Error(`Unknown entry status: ${to}`);
    workflowRevisionId = pinned.id;
    if (workflowEdge.notify) {
      const targetStatus = pinned.workflow.statuses.find(
        (status) => status.key === to,
      )!;
      notification = {
        statusKey: targetStatus.key,
        statusLabelDe: targetStatus.labels.de,
        statusLabelEn: targetStatus.labels.en,
      };
    }
  } else {
    assertEntryTransition(kind, from, to);
    if (!reason.trim()) throw new Error('Transition reason is required');
  }
  return deps.entries.transition(
    ctx,
    id,
    kind,
    from,
    to,
    actor.trim(),
    reason.trim(),
    statusCategory
      ? {
          statusCategory,
          workflowRevisionId: workflowRevisionId!,
          ...(notification ? { notification } : {}),
        }
      : undefined,
  );
}

export interface ClassPriceRule {
  readonly classId: string;
  readonly baseCents: number;
  /** Signed adjustment applied to every entry after the first in this group. */
  readonly additionalEntryAdjustmentCents: number;
  readonly earlyBirdDeadline: string | null;
  readonly earlyBirdDiscountCents: number;
}
export interface PriceLineInput {
  readonly classId: string;
  readonly quantity: number;
  readonly rule: ClassPriceRule;
}
export interface PriceSnapshotLine {
  readonly classId: string;
  readonly quantity: number;
  readonly baseCents: number;
  readonly additionalEntryAdjustmentCents: number;
  readonly earlyBirdDiscountCents: number;
  readonly totalCents: number;
}
export interface PriceSnapshot {
  readonly version: '1';
  readonly currency: string;
  readonly calculatedAt: string;
  readonly totalCents: number;
  readonly lines: readonly PriceSnapshotLine[];
}
export function calculatePrice(input: {
  currency: string;
  lines: readonly PriceLineInput[];
  submittedAt: string;
}): PriceSnapshot {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Invalid currency');
  const submitted = Date.parse(input.submittedAt);
  if (!Number.isFinite(submitted)) throw new Error('Invalid submission time');
  const classIds = new Set<string>();
  const lines = input.lines.map(({ classId, quantity, rule }) => {
    if (classIds.has(classId) || classId !== rule.classId)
      throw new Error('Invalid or duplicate class price rule');
    classIds.add(classId);
    for (const amount of [
      rule.baseCents,
      rule.additionalEntryAdjustmentCents,
      rule.earlyBirdDiscountCents,
    ])
      if (!Number.isSafeInteger(amount))
        throw new Error('Price amounts must be integer cents');
    if (
      rule.baseCents < 0 ||
      rule.earlyBirdDiscountCents < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1
    )
      throw new Error('Invalid quantity or price');
    if (
      rule.earlyBirdDeadline !== null &&
      !Number.isFinite(Date.parse(rule.earlyBirdDeadline))
    )
      throw new Error('Invalid early-bird deadline');
    const early =
      rule.earlyBirdDeadline !== null &&
      submitted <= Date.parse(rule.earlyBirdDeadline)
        ? rule.earlyBirdDiscountCents
        : 0;
    const gross =
      rule.baseCents * quantity +
      rule.additionalEntryAdjustmentCents * (quantity - 1) -
      early * quantity;
    const totalCents = Math.max(0, gross);
    if (!Number.isSafeInteger(totalCents))
      throw new Error('Price total exceeds safe integer range');
    return Object.freeze({
      classId,
      quantity,
      baseCents: rule.baseCents,
      additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
      earlyBirdDiscountCents: early,
      totalCents,
    });
  });
  return Object.freeze({
    version: '1',
    currency: input.currency,
    calculatedAt: new Date(submitted).toISOString(),
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    lines: Object.freeze(lines),
  });
}
export function createPaymentReference(seed: string): string {
  const compact = seed
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(-20);
  if (!compact) throw new Error('Reference seed is required');
  const rearranged = `${compact}RF00`;
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  const check = String(98 - remainder).padStart(2, '0');
  return `RF${check}${compact}`;
}
export function isValidPaymentReference(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(compact)) return false;
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
export function validateIban(value: string): boolean {
  const iban = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  let remainder = 0;
  for (const char of `${iban.slice(4)}${iban.slice(0, 4)}`) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
export interface PaymentRecipient {
  readonly accountName: string;
  readonly iban: string;
  readonly bic?: string | null;
}
export function validatePaymentRecipient(
  input: PaymentRecipient,
): PaymentRecipient {
  if (
    !input.accountName.trim() ||
    input.accountName.length > 70 ||
    !validateIban(input.iban) ||
    (input.bic != null &&
      !/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/.test(input.bic.toUpperCase()))
  )
    throw new Error('Invalid bank recipient');
  return Object.freeze({
    accountName: input.accountName.trim(),
    iban: input.iban.replace(/\s+/g, '').toUpperCase(),
    bic: input.bic?.toUpperCase() ?? null,
  });
}
export function createTransferInstruction(input: {
  recipient: PaymentRecipient | null;
  amountCents: number;
  currency: string;
  reference: string;
  remittanceText?: string;
}): string | null {
  if (!input.recipient) return null;
  const recipient = validatePaymentRecipient(input.recipient);
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 0 ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    !isValidPaymentReference(input.reference)
  )
    throw new Error('Invalid transfer instruction');
  const lines = [
    'BCD',
    '001',
    '1',
    'SCT',
    recipient.bic ?? '',
    recipient.accountName,
    recipient.iban,
    `${input.currency}${(input.amountCents / 100).toFixed(2)}`,
    '',
    input.reference,
    (input.remittanceText ?? '').slice(0, 140),
  ];
  // EPC069-12 payload fields are newline separated. Keep amount currency independent of locale.
  return lines.join('\n');
}
export interface EventClassPricingRepository {
  listByEvent(ctx: RequestContext, eventId: string): Promise<ClassPriceRule[]>;
  upsert(
    ctx: RequestContext,
    eventId: string,
    rule: ClassPriceRule,
  ): Promise<ClassPriceRule>;
}
export async function setClassPriceRule(
  ctx: RequestContext,
  eventId: string,
  rule: ClassPriceRule,
  deps: { pricing: EventClassPricingRepository },
): Promise<ClassPriceRule> {
  if (!ctx.permissions.has('event:write')) throw new Error('Forbidden');
  if (
    !rule.classId.trim() ||
    !Number.isSafeInteger(rule.baseCents) ||
    rule.baseCents < 0 ||
    !Number.isSafeInteger(rule.additionalEntryAdjustmentCents) ||
    !Number.isSafeInteger(rule.earlyBirdDiscountCents) ||
    rule.earlyBirdDiscountCents < 0 ||
    (rule.earlyBirdDeadline !== null &&
      !Number.isFinite(Date.parse(rule.earlyBirdDeadline)))
  )
    throw new Error('Invalid price rule');
  return deps.pricing.upsert(ctx, eventId, rule);
}
export interface InvoiceRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly eventId: string;
  readonly registrationGroupId: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentReference: string;
  readonly status: InvoiceStatus;
}
export interface InvoiceRepository {
  issue(
    ctx: RequestContext,
    eventId: string,
    registrationGroupId: string,
    snapshot: PriceSnapshot,
    executor?: unknown,
  ): Promise<InvoiceRecord>;
}
export async function issueInvoice(
  ctx: RequestContext,
  eventId: string,
  registrationGroupId: string,
  snapshot: PriceSnapshot,
  deps: { invoices: InvoiceRepository },
  executor?: unknown,
): Promise<InvoiceRecord> {
  if (
    snapshot.version !== '1' ||
    !Number.isSafeInteger(snapshot.totalCents) ||
    snapshot.totalCents < 0
  )
    throw new Error('Invalid price snapshot');
  return deps.invoices.issue(
    ctx,
    eventId,
    registrationGroupId,
    snapshot,
    executor,
  );
}
export interface PaymentRecipientRepository {
  get(ctx: RequestContext): Promise<PaymentRecipient | null>;
  set(
    ctx: RequestContext,
    recipient: PaymentRecipient,
  ): Promise<PaymentRecipient>;
}
export async function updatePaymentRecipient(
  ctx: RequestContext,
  recipient: PaymentRecipient,
  deps: { recipients: PaymentRecipientRepository },
): Promise<PaymentRecipient> {
  if (!ctx.permissions.has('organization:update')) throw new Error('Forbidden');
  return deps.recipients.set(ctx, validatePaymentRecipient(recipient));
}
export type InvoiceStatus = 'open' | 'partially_paid' | 'paid' | 'cancelled';
export function deriveInvoiceStatus(
  totalCents: number,
  receivedCents: number,
  cancelled = false,
): InvoiceStatus {
  if (cancelled) return 'cancelled';
  if (receivedCents <= 0) return 'open';
  return receivedCents >= totalCents ? 'paid' : 'partially_paid';
}
export interface InvoicePaymentRepository {
  record(
    ctx: RequestContext,
    invoiceId: string,
    amountCents: number,
    actor: string,
    reason: string,
  ): Promise<unknown | null>;
  correct(
    ctx: RequestContext,
    paymentId: string,
    actor: string,
    reason: string,
  ): Promise<unknown | null>;
}
export async function recordInvoicePayment(
  ctx: RequestContext,
  invoiceId: string,
  amountCents: number,
  actor: string,
  reason: string,
  deps: { payments: InvoicePaymentRepository },
): Promise<unknown | null> {
  if (!ctx.permissions.has('payment:write')) throw new Error('Forbidden');
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !actor.trim() ||
    !reason.trim()
  )
    throw new Error('Invalid payment');
  return deps.payments.record(
    ctx,
    invoiceId,
    amountCents,
    actor.trim(),
    reason.trim(),
  );
}
export async function correctInvoicePayment(
  ctx: RequestContext,
  paymentId: string,
  actor: string,
  reason: string,
  deps: { payments: InvoicePaymentRepository },
): Promise<unknown | null> {
  if (!ctx.permissions.has('payment:write')) throw new Error('Forbidden');
  if (!actor.trim() || !reason.trim())
    throw new Error('Correction actor and reason are required');
  return deps.payments.correct(ctx, paymentId, actor.trim(), reason.trim());
}

export type EntryExportField =
  'driver' | 'vehicle' | 'class' | 'startNumber' | 'status' | 'price';
export const entryExportFields: readonly EntryExportField[] = [
  'driver',
  'vehicle',
  'class',
  'startNumber',
  'status',
  'price',
];
/** Protect spreadsheet consumers from formula execution, including control-character prefixes. */
export function csvSafeCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value);
  // Spreadsheet applications may ignore leading whitespace/control/format chars
  // before formula markers. Keep the original cell but prefix an apostrophe when
  // its first significant character would otherwise start a formula.
  if (/^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function renderEntryCsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return (
    rows.map((row) => row.map(csvSafeCell).join(',')).join('\r\n') + '\r\n'
  );
}
export * from './modules.js';

export * from './timing.js';
