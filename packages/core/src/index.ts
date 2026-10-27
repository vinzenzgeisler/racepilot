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
}
export type OrganizationPatch = Partial<
  Pick<
    Organization,
    'name' | 'contactEmail' | 'websiteUrl' | 'timezone' | 'locale'
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
  getById(ctx: RequestContext, eventId: string): Promise<unknown | null>;
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
