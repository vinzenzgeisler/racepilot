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
}
export type OrganizationPatch = Partial<
  Pick<
    Organization,
    'name' | 'contactEmail' | 'websiteUrl' | 'timezone' | 'locale'
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
      ])
    : new Set();
}
export interface MailMessage {
  readonly organizationId: OrganizationId;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly idempotencyKey: string;
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
