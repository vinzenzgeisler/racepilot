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

export type EntryVerificationStatus = 'unverified' | 'verified';
export type EntryAcceptanceStatus =
  'pending' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn';
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
export interface EntryRepository {
  create?(ctx: RequestContext, input: EntryInput): Promise<Entry>;
  getById(ctx: RequestContext, id: string): Promise<Entry | null>;
  transition(
    ctx: RequestContext,
    id: string,
    transition: 'verification' | 'acceptance',
    fromStatus: string,
    toStatus: string,
    actor: string,
    reason: string,
  ): Promise<Entry | null>;
  softDelete(
    ctx: RequestContext,
    id: string,
    reason: string,
  ): Promise<Entry | null>;
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
  deps: { entries: EntryRepository },
): Promise<Entry | null> {
  if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
  if (!actor.trim() || !reason.trim())
    throw new Error('Transition actor and reason are required');
  const current = await deps.entries.getById(ctx, id);
  if (!current) return null;
  const from =
    kind === 'verification'
      ? current.verificationStatus
      : current.acceptanceStatus;
  assertEntryTransition(kind, from, to);
  return deps.entries.transition(
    ctx,
    id,
    kind,
    from,
    to,
    actor.trim(),
    reason.trim(),
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
    ` სახ${input.currency}${(input.amountCents / 100).toFixed(2)}`.replace(
      ' სახ',
      'EUR',
    ),
    '',
    `${input.currency}${(input.amountCents / 100).toFixed(2)}`,
    '',
    `RF${input.reference.slice(2)}`,
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
  ): Promise<InvoiceRecord>;
}
export async function issueInvoice(
  ctx: RequestContext,
  eventId: string,
  registrationGroupId: string,
  snapshot: PriceSnapshot,
  deps: { invoices: InvoiceRepository },
): Promise<InvoiceRecord> {
  if (
    snapshot.version !== '1' ||
    !Number.isSafeInteger(snapshot.totalCents) ||
    snapshot.totalCents < 0
  )
    throw new Error('Invalid price snapshot');
  return deps.invoices.issue(ctx, eventId, registrationGroupId, snapshot);
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
