import type { JobContext, OrganizationId, RequestContext } from './context.js';
import type { StoredObjectRef } from './providers.js';
import type {
  EntryAcceptanceStatus,
  EntryVerificationStatus,
} from './workflow-model.js';

export interface EntryExportRow {
  readonly driver: string;
  readonly vehicle: string;
  readonly class: string;
  readonly startNumber: string | null;
  readonly status: EntryAcceptanceStatus;
  readonly priceCents: number | null;
}

export interface EntryExportFilters {
  readonly classId?: string;
  readonly acceptanceStatus?: EntryAcceptanceStatus;
  readonly verificationStatus?: EntryVerificationStatus;
  readonly paymentStatus?:
    'open' | 'partially_paid' | 'paid' | 'not_required' | 'not_relevant';
  readonly search?: string;
}

export interface EntryExportRepository {
  listByEvent(
    ctx: RequestContext,
    eventId: string,
    filters: EntryExportFilters,
  ): Promise<readonly EntryExportRow[]>;
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
  readonly filters: EntryExportFilters;
  readonly delimiter: ',' | ';';
  readonly expiresAt: string | null;
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

export type ArtifactJobEnqueueResult =
  | { readonly ok: true; readonly job: ArtifactJob }
  | { readonly ok: false; readonly error: 'idempotency-conflict' };

export interface ArtifactJobEnqueueInput {
  readonly eventId: string;
  readonly kind: ArtifactKind;
  readonly registrationGroupId?: string;
  readonly fields?: readonly string[];
  readonly filters?: EntryExportFilters;
  readonly delimiter?: ',' | ';';
  readonly idempotencyKey: string;
}

export interface ArtifactJobRepository {
  enqueue(
    ctx: RequestContext,
    input: ArtifactJobEnqueueInput,
  ): Promise<ArtifactJobEnqueueResult>;
  getById(ctx: RequestContext, id: string): Promise<ArtifactJob | null>;
  listByEvent(
    ctx: RequestContext,
    eventId: string,
    kind: ArtifactKind,
    limit: number,
  ): Promise<readonly ArtifactJob[]>;
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
