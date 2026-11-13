import { OrganizationId } from './context.js';
import { RequestContext } from './context.js';
import type { PassengerMode } from './passengers.js';

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
  orgaCodePrefix?: string | null;
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
  orgaCodePrefix?: string | null;
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
  passengerMode: PassengerMode;
}

export type EventClassInput = Omit<
  EventClass,
  'id' | 'organizationId' | 'eventId' | 'passengerMode'
> & { passengerMode?: PassengerMode };

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

export function validateEventInput(
  input: EventInput | EventPatch,
  partial = false,
): void {
  if (
    input.orgaCodePrefix !== undefined &&
    input.orgaCodePrefix !== null &&
    !/^[A-Z0-9]{1,12}$/.test(input.orgaCodePrefix.trim().toUpperCase())
  )
    throw new Error('Invalid organization code prefix');
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

export function validateClass(
  input: Partial<EventClassInput>,
  partial = false,
): void {
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
    input.passengerMode !== undefined &&
    !['none', 'optional', 'required'].includes(input.passengerMode)
  )
    throw new Error('Invalid passenger mode');
  if (
    input.maxParticipants !== undefined &&
    input.maxParticipants !== null &&
    (!Number.isInteger(input.maxParticipants) || input.maxParticipants < 1)
  )
    throw new Error('Invalid participant limit');
}
