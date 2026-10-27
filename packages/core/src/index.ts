export type OrganizationId = string & { readonly __brand: 'OrganizationId' };

export function organizationId(value: string): OrganizationId {
  if (value.trim().length === 0)
    throw new Error('Organization ID cannot be empty');
  return value as OrganizationId;
}
