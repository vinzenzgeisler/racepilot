import type { RequestContext } from './context.js';

/** The organization a piece of work belongs to; request and job contexts both satisfy it. */
export type TenantRef = Pick<
  RequestContext,
  'deploymentMode' | 'organizationId'
>;

/**
 * Port: the verified public origin (scheme, host, optional port) under which an
 * organization is reachable, or `null` when it has none. Community returns its
 * configured origin; Cloud returns the organization's verified tenant host.
 * Links in mails and confirmations are built only from this origin, never from
 * request headers.
 */
export type CanonicalOrigin = (tenant: TenantRef) => Promise<string | null>;

/** Port: per-organization mail identity; `null` when the organization cannot send mail. */
export interface OrganizationMail {
  configuration(
    tenant: TenantRef,
  ): Promise<{ from: string; replyTo: string | null } | null>;
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Community: every organization shares the one configured origin. */
export function staticCanonicalOrigin(baseUrl: string): CanonicalOrigin {
  const origin = originOf(baseUrl);
  if (!origin) throw new Error('Invalid canonical URL');
  return async () => origin;
}

/** Resolves and validates the origin; a failing or malformed resolver yields `null` (fail closed). */
export async function resolveCanonicalOrigin(
  port: CanonicalOrigin,
  tenant: TenantRef,
): Promise<string | null> {
  try {
    const value = await port(tenant);
    return value === null ? null : originOf(value);
  } catch {
    return null;
  }
}
