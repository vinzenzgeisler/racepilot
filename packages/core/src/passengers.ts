import type { RequestContext } from './context.js';
import type { AdminEntryConsent } from './entry-detail.js';

/** A personal link stays valid for three days; the office can issue a new one at any time. */
export const PASSENGER_LINK_TTL_MS = 72 * 60 * 60 * 1000;

export type PassengerMode = 'none' | 'optional' | 'required';

export const passengerModes: readonly PassengerMode[] = [
  'none',
  'optional',
  'required',
];

type FormConfig = { features?: Record<string, unknown> } | null | undefined;

/** An event's setting wins over the organization's; both default to "not offered". */
export function registrationFeatureEnabled(
  organizationConfig: FormConfig,
  eventConfig: FormConfig,
  feature: 'passenger' | 'spareVehicle',
): boolean {
  return (
    (eventConfig?.features?.[feature] ??
      organizationConfig?.features?.[feature]) === true
  );
}

/** The class decides only where the event offers co-drivers at all. */
export function effectivePassengerMode(
  featureEnabled: boolean,
  classMode: PassengerMode,
): PassengerMode {
  return featureEnabled ? classMode : 'none';
}

export interface AdminEntryPassenger {
  firstName: string;
  lastName: string;
  email: string | null;
  dateOfBirth: string | null;
  country: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  source: 'registration' | 'admin';
  status: 'recorded' | 'invited' | 'completed';
  completedAt: string | null;
  linkExpiresAt: string | null;
  /** The co-driver's own acceptances, separate from the driver's. */
  consents: AdminEntryConsent[];
}

export interface AdminEntrySpareVehicle {
  make: string;
  model: string;
  year: number | null;
  registration: string | null;
}

export interface PassengerCreateInput {
  firstName: string;
  lastName: string;
  email?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
}

export interface PassengerDetailsInput {
  firstName: string;
  lastName: string;
  email?: string | null | undefined;
  dateOfBirth: string;
  country?: string | null | undefined;
  phone?: string | null | undefined;
  street?: string | null | undefined;
  postalCode?: string | null | undefined;
  city?: string | null | undefined;
  emergencyContactName?: string | null | undefined;
  emergencyContactPhone?: string | null | undefined;
}

export interface PassengerConsentInput {
  key: string;
  version: string;
  hash: string;
}

/**
 * - `not_found`: no such entry in the caller's organization.
 * - `unavailable`: the entry's class or the event does not take a co-driver.
 * - `exists`: the entry already has a co-driver.
 */
export type PassengerAddResult =
  { status: 'created' } | { status: 'not_found' | 'unavailable' | 'exists' };

export type PassengerLinkResult =
  | { status: 'created'; url: string; expiresAt: string; mailQueued: boolean }
  | { status: 'not_found' | 'no_passenger' | 'completed' | 'unavailable' };

/** Office-side co-driver maintenance. Every call checks `entry:write` and the caller's organization. */
export interface PassengerAdminRepository {
  add(
    ctx: RequestContext,
    entryId: string,
    input: PassengerCreateInput,
    actor: string,
  ): Promise<PassengerAddResult>;
  /**
   * Issues a new personal link and revokes older open ones. With an address on record (or given)
   * the link is also queued as mail; without, the office hands it over itself.
   */
  issueLink(
    ctx: RequestContext,
    entryId: string,
    input: {
      firstName?: string | undefined;
      lastName?: string | undefined;
      email?: string | null | undefined;
    },
    actor: string,
  ): Promise<PassengerLinkResult>;
}

/** What the co-driver sees behind a link: their own record and the terms of the event. */
export interface PassengerLinkView {
  eventName: string;
  className: string;
  driverName: string;
  language: 'de' | 'en';
  passenger: Omit<
    AdminEntryPassenger,
    'source' | 'status' | 'completedAt' | 'linkExpiresAt' | 'consents'
  >;
  terms: Array<{
    key: string;
    version: string;
    language: 'de' | 'en';
    text: string;
    hash: string;
    required: boolean;
  }>;
  expiresAt: string;
}

export type PassengerCompletionResult =
  | 'completed'
  | 'unavailable'
  | 'terms_mismatch'
  | 'terms_required'
  | 'guardian_required'
  | 'invalid';

/** Token-based access without a login. A missing, expired, used or foreign token is just `null`. */
export interface PassengerPublicRepository {
  resolve(
    ctx: RequestContext,
    token: string,
  ): Promise<PassengerLinkView | null>;
  complete(
    ctx: RequestContext,
    token: string,
    language: 'de' | 'en',
    passenger: PassengerDetailsInput,
    consents: readonly PassengerConsentInput[],
  ): Promise<PassengerCompletionResult>;
}

/** Actions the entry detail offers for the co-driver; empty when the class or event takes none. */
export function availablePassengerActions(details: {
  passengerMode?: PassengerMode | undefined;
  passenger?: Pick<AdminEntryPassenger, 'status'> | null | undefined;
}): Array<'passenger:add' | 'passenger:link'> {
  if (!details.passengerMode || details.passengerMode === 'none') return [];
  if (!details.passenger) return ['passenger:add', 'passenger:link'];
  return details.passenger.status === 'completed' ? [] : ['passenger:link'];
}
