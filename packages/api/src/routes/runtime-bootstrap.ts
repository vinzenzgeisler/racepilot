import {
  resolveOrganizationModuleCapabilities,
  validatePaymentRecipient,
  type TenantRef,
} from '@racepilot/core';
import { RuntimeBootstrapResponse } from '@racepilot/contracts';
import type { ApiRoutesContext } from './context.js';

/** Presentation-only runtime contract; every value is resolved server-side per request. */
export function registerRuntimeBootstrapRoute({
  app,
  deps,
  resolvePublicContext,
}: ApiRoutesContext): void {
  const organizationCapabilities = async (tenant: TenantRef) => {
    try {
      return (await deps.organizationCapabilities?.(tenant)) ?? [];
    } catch {
      return []; // capabilities fail closed
    }
  };
  app.get('/runtime/bootstrap', async (c) => {
    try {
      const context = await resolvePublicContext(c.req.raw);
      if (!context) return c.json({ error: 'Runtime unavailable' }, 404);
      const organization = await deps.organizations.getById(context);
      if (!organization || organization.status !== 'active')
        return c.json({ error: 'Runtime unavailable' }, 404);
      const bankTransferAvailable = await (async () => {
        try {
          const recipient = await deps.paymentRecipients.get(context);
          if (!recipient) return false;
          validatePaymentRecipient(recipient);
          return true;
        } catch {
          return false;
        }
      })();
      const capabilities = new Set([
        ...(deps.runtimeBootstrap?.capabilities ?? []),
        ...context.capabilities,
        ...(await organizationCapabilities(context)),
      ]);
      if (bankTransferAvailable) capabilities.add('payment.bank_transfer');
      else capabilities.delete('payment.bank_transfer');
      if (deps.modules) {
        // Module availability is computed here; clients cannot supply it.
        for (const key of await resolveOrganizationModuleCapabilities(
          context,
          deps.modules,
        ).catch(() => []))
          capabilities.add(key);
      }
      const result = RuntimeBootstrapResponse.parse({
        schemaVersion: 1,
        configurationVersion:
          deps.runtimeBootstrap?.configurationVersion ?? '1',
        deploymentMode: context.deploymentMode,
        organization: {
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
        },
        branding: {
          logoUrl: deps.runtimeBootstrap?.branding?.logoUrl ?? null,
          primaryColor:
            deps.runtimeBootstrap?.branding?.primaryColor ?? '#174ea6',
          accentColor:
            deps.runtimeBootstrap?.branding?.accentColor ?? '#8a5a00',
          contactEmail: organization.contactEmail,
          eventImageUrl: deps.runtimeBootstrap?.branding?.eventImageUrl ?? null,
        },
        locale: organization.locale,
        // The current event lifecycle contract has no authoritative "active" event selection.
        activeEvent: null,
        capabilities: [...capabilities],
        legalLinks: deps.runtimeBootstrap?.legalLinks ?? [],
      });
      c.header('Cache-Control', 'private, max-age=0, must-revalidate');
      c.header('Vary', 'Host');
      c.header('ETag', `W/"${result.configurationVersion}"`);
      return c.json(result);
    } catch {
      return c.json({ error: 'Runtime unavailable' }, 404);
    }
  });
}
