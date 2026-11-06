import type { RequestContext } from './context.js';

export interface AdminEntryDriver {
  name: string;
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
  vehicleType?: string | null;
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

/** Admin-side maintenance of the person and vehicle behind one entry. */
export interface EntryDetailRepository {
  /** Returns false when the entry does not exist in the caller's organization. */
  updateDriver(
    ctx: RequestContext,
    entryId: string,
    patch: EntryDriverPatch,
    actor: string,
  ): Promise<boolean>;
  updateVehicle(
    ctx: RequestContext,
    entryId: string,
    patch: EntryVehiclePatch,
    actor: string,
  ): Promise<boolean>;
  /** Null when the entry does not exist in the caller's organization. */
  listMessages(
    ctx: RequestContext,
    entryId: string,
  ): Promise<EntryMessage[] | null>;
}
