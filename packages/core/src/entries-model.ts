import { EntryAcceptanceStatus } from './workflow-model.js';
import { EntryStatusProjection } from './status-config.js';
import { EntryVerificationStatus } from './workflow-model.js';
import { EntryWorkflowCategory } from './workflow-model.js';
import { JobContext } from './context.js';
import { OrganizationId } from './context.js';
import { PriceSnapshot } from './pricing.js';
import { RequestContext } from './context.js';
import { StoredObjectRef } from './providers.js';
import type {
  AdminEntryConsent,
  AdminEntryDriver,
  AdminEntryInvoice,
  AdminEntryVehicle,
} from './entry-detail.js';

export interface Person {
  id: string;
  organizationId: OrganizationId;
  firstName: string;
  lastName: string;
  email: string | null;
  emailNormalized: string | null;
  dateOfBirth: string | null;
  country: string | null;
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
  imageUrl?: string | null;
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
  adminHistory?: Array<{
    id: string;
    kind: 'entry' | 'status' | 'payment' | 'email';
    label: string;
    actor: string;
    occurredAt: string;
    detail: string;
  }>;
  adminDetails?: {
    driver: AdminEntryDriver;
    vehicle: AdminEntryVehicle;
    invoice?: AdminEntryInvoice | null;
    consents?: AdminEntryConsent[];
    eventClass: {
      code: string;
      name: string;
      vehicleType?: 'car' | 'motorcycle' | 'kart' | 'other';
    };
    startNumber: string | null;
    customAnswers: Array<{
      key: string;
      label: string;
      value: string | boolean | null;
      fileDownloadUrl: string | null;
    }>;
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
  'firstName' | 'lastName' | 'email' | 'dateOfBirth' | 'country'
>;

export type VehicleInput = Pick<
  Vehicle,
  'make' | 'model' | 'year' | 'registration'
> & { imageUrl?: string | null };

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
  countByStatus?(
    ctx: RequestContext,
    eventId: string,
  ): Promise<Record<string, number>>;
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
  readonly paymentStatus?:
    'open' | 'partially_paid' | 'paid' | 'not_required' | 'not_relevant';
  readonly search?: string;
  // prettier-ignore
  readonly sort: 'createdAt' | 'requestedStartNumber' | 'acceptanceStatus' | 'verificationStatus';
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
