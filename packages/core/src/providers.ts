import { organizationId } from './context.js';
import { OrganizationId } from './context.js';

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
        'timing:record',
        'timing:correct',
        'timing:publish',
        'timing:read',
        'role:admin',
      ])
    : new Set(['role:member']);
}

export interface MailMessage {
  readonly organizationId: OrganizationId;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly idempotencyKey: string;
  readonly from?: string;
  readonly replyTo?: string;
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

/** Executable, provider-neutral assertions shared by adapter contract tests. */
export async function verifyObjectStorageContract(
  storage: ObjectStorageProvider,
): Promise<void> {
  const owner = organizationId('contract_org_a');
  const foreign = organizationId('contract_org_b');
  const body = new TextEncoder().encode('storage port contract');
  const ref = await storage.put({
    organizationId: owner,
    body,
    contentType: 'text/plain',
  });
  if (
    !/^[0-9a-f-]{36}$/.test(ref.objectId) ||
    ref.organizationId !== owner ||
    ref.size !== body.length ||
    !/^[a-f0-9]{64}$/.test(ref.sha256)
  )
    throw new Error('Storage put contract failed');
  const result = await storage.get(owner, ref.objectId);
  if (
    !result ||
    result.ref.sha256 !== ref.sha256 ||
    result.ref.contentType !== ref.contentType ||
    result.body.length !== body.length ||
    result.body.some((value, index) => value !== body[index])
  )
    throw new Error('Storage get contract failed');
  if ((await storage.get(foreign, ref.objectId)) !== null)
    throw new Error('Foreign organization must not read object');
  let rejected = false;
  try {
    await storage.get(owner, '../etc/passwd');
  } catch (error) {
    rejected = error instanceof ProviderError && error.code === 'invalid_input';
  }
  if (!rejected) throw new Error('Invalid object identifier must be rejected');
  await storage.delete(owner, ref.objectId);
  if ((await storage.get(owner, ref.objectId)) !== null)
    throw new Error('Deleted object must not be returned');
}
