import { Organization } from './context.js';
import { OrganizationPatch } from './context.js';
import { OrganizationRepository } from './context.js';
import { RequestContext } from './context.js';

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
  if (
    'currency' in patch &&
    (typeof patch.currency !== 'string' || !/^[A-Z]{3}$/.test(patch.currency))
  )
    throw new Error('Invalid currency');
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
