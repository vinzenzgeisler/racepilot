export const deploymentModes = ['community', 'cloud'] as const;

export type DeploymentMode = (typeof deploymentModes)[number];

export type OrganizationId = string & { readonly __brand: 'OrganizationId' };

/**
 * Parses the deployment mode from trusted server configuration (ADR 0001).
 * Never call this with client-supplied values.
 */
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
