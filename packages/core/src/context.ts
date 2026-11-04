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
  currency: string;
}

export type OrganizationPatch = Partial<
  Pick<
    Organization,
    'name' | 'contactEmail' | 'websiteUrl' | 'timezone' | 'locale' | 'currency'
  >
>;

export interface OrganizationRepository {
  getById(ctx: RequestContext): Promise<Organization | null>;
  update(
    ctx: RequestContext,
    patch: OrganizationPatch,
  ): Promise<Organization | null>;
}
