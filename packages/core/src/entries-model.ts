import {
  EntryAcceptanceStatus,
  EntryVerificationStatus,
  EntryWorkflowCategory,
} from './workflow-model.js';
import { EntryStatusProjection } from './status-config.js';
import { EntryVerificationStatus, EntryWorkflowCategory } from './workflow-model.js';
import { JobContext, OrganizationId, RequestContext } from './context.js';
import { PriceSnapshot } from './pricing.js';
import { StoredObjectRef } from './providers.js';
import type { AdminEntryDetails, AdminEntryHistoryItem } from './entry-detail.js';

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
  revision: number;
  deletedAt: string | null;
  deletionReason: string | null;
  /** Read-model fields computed from the pinned workflow, event configuration and source records. */
  adminHistory?: AdminEntryHistoryItem[];
  adminDetails?: AdminEntryDetails;
  statusProjection?: EntryStatusProjection;
  orgaCode: string;
  documentProjection?: import('./documents.js').EntryDocumentProjection;
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
