import type { RequestContext } from './context.js';

/** One recorded acceptance of a versioned text; `text` is null when the event no longer carries it. */
export interface AdminEntryConsent {
  key: string;
  version: string;
  language: 'de' | 'en';
  acceptedAt: string;
  text: string | null;
  required: boolean | null;
}

export interface AdminEntryDriver {
  /** Display name; edit the structured parts below, never split this string. */
  name: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  country: string | null;
  email: string | null;
  emailVerified: boolean;
  phone?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  publicationPreference?: 'name_visible' | 'initials' | 'hidden' | null;
  /** Name, birth date and country belong to the person; true when entries elsewhere use the same person. */
  identityShared?: boolean;
  /** Entries of this registration; contact data applies to all of them. */
  registrationEntryCount?: number;
}

export interface AdminEntryVehicle {
  make: string;
  model: string;
  year: number | null;
  registration?: string | null;
  imageUrl?: string | null;
  vehicleType?: string | null;
  displacementCc?: number | null;
  cylinders?: number | null;
  ownerName?: string | null;
  history?: string | null;
}

export interface AdminEntryInvoice {
  id: string;
  paymentReference: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  status: 'open' | 'partially_paid' | 'paid' | 'cancelled';
}

export interface EntryDriverPatch {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | null;
  country?: string | null;
  phone?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  publicationPreference?: 'name_visible' | 'initials' | 'hidden' | null;
}

export interface EntryVehiclePatch {
  make?: string;
  model?: string;
  year?: number | null;
  registration?: string | null;
  displacementCc?: number | null;
  cylinders?: number | null;
  ownerName?: string | null;
  history?: string | null;
}

export interface EntryMessage {
  id: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  subject: string;
  templateKey: string;
  recipient: string;
  createdAt: string;
  sentAt: string | null;
}

/**
 * - `not_found`: no such entry in the caller's organization.
 * - `person_shared`: the change touches name, birth date or country of a person that other
 *   registrations use; nothing was written.
 */
export type EntryUpdateResult = 'updated' | 'not_found' | 'person_shared';

/**
 * Admin-side maintenance behind one entry.
 * Contact, address, emergency and publication data are stored per registration and apply to
 * the entries of that registration only. A vehicle that several entries share is copied for
 * the edited entry. Every change is audited on each affected entry.
 */
export interface EntryDetailRepository {
  updateDriver(
    ctx: RequestContext,
    entryId: string,
    patch: EntryDriverPatch,
    actor: string,
  ): Promise<EntryUpdateResult>;
  updateVehicle(
    ctx: RequestContext,
    entryId: string,
    patch: EntryVehiclePatch,
    actor: string,
  ): Promise<Exclude<EntryUpdateResult, 'person_shared'>>;
  /** Null when the entry does not exist in the caller's organization. */
  listMessages(
    ctx: RequestContext,
    entryId: string,
  ): Promise<EntryMessage[] | null>;
}
