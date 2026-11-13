import {
  createRequestContext,
  organizationId,
  validatePaymentRecipient,
  type DeploymentMode,
  type RequestContext,
} from '@racepilot/core';
import type { ApiDeps, ContextResolvers } from './types.js';

type Resolve = (request: Request) => Promise<RequestContext | null>;

export interface ResolvedContexts extends ContextResolvers {
  readonly mode: DeploymentMode;
  readonly communityOrganizationId: string | undefined;
}

/**
 * Community: the one configured organization; members authenticate through the
 * authenticator and the membership repository. Cloud: the assembly's resolvers.
 * Either way a context is accepted only for the server-fixed deployment mode.
 */
export function createContextResolvers(deps: ApiDeps): ResolvedContexts {
  const mode = deps.config.deploymentMode;
  const communityOrganizationId =
    mode === 'community' ? deps.config.organizationId : undefined;
  const accept = (context: RequestContext | null) => {
    if (!context || context.deploymentMode !== mode) return null;
    if (
      communityOrganizationId &&
      context.organizationId !== communityOrganizationId
    )
      return null;
    return context;
  };
  const delegated = (resolve: Resolve): Resolve => {
    return async (request) => {
      try {
        return accept(await resolve(request));
      } catch {
        return null;
      }
    };
  };
  if (deps.contextResolvers)
    return {
      mode,
      communityOrganizationId,
      public: delegated(deps.contextResolvers.public),
      member: delegated(deps.contextResolvers.member),
    };
  if (!communityOrganizationId)
    return {
      mode,
      communityOrganizationId,
      public: async () => null,
      member: async () => null,
    };
  const organization = organizationId(communityOrganizationId);
  return {
    mode,
    communityOrganizationId,
    public: async () =>
      createRequestContext({
        deploymentMode: mode,
        organizationId: organization,
        permissions: new Set(),
        capabilities: new Set(),
        correlationId: crypto.randomUUID(),
      }),
    member: async (request) => {
      const identity =
        (await deps.authenticator?.authenticate(request).catch(() => null)) ??
        null;
      if (!identity) return null;
      const permissions =
        (await deps.memberships
          ?.resolvePermissions(identity, organization, deps.bootstrap)
          .catch(() => new Set<string>())) ?? new Set<string>();
      const capabilities = new Set(deps.runtimeBootstrap?.capabilities ?? []);
      capabilities.delete('payment.bank_transfer');
      try {
        const recipient = await deps.paymentRecipients.get(
          createRequestContext({
            deploymentMode: mode,
            organizationId: organization,
            permissions,
            capabilities: new Set(),
            correlationId: crypto.randomUUID(),
          }),
        );
        if (recipient) {
          validatePaymentRecipient(recipient);
          capabilities.add('payment.bank_transfer');
        }
      } catch {
        /* capability fails closed */
      }
      return createRequestContext({
        deploymentMode: mode,
        organizationId: organization,
        subject: { issuer: identity.issuer, subject: identity.subject },
        permissions,
        capabilities,
        correlationId: crypto.randomUUID(),
      });
    },
  };
}
