import type { OrganizationId, RequestContext, JobContext } from './context.js';
import type { StoredObjectRef } from './providers.js';

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
