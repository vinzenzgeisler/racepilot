import { serve } from '@hono/node-server';
import { loadConfig } from './index.js';
import {
  createDatabase,
  migrate,
  ensureCommunityOrganization,
  createOrganizationRepository,
  createEventRepository,
  createEventClassRepository,
  createMembershipRepository,
  createInvoicePaymentRepository,
  createPaymentRecipientRepository,
  createEventClassPricingRepository,
} from '@racepilot/adapter-postgres';
import { createApp } from './index.js';
import { createOIDCIdentityProvider } from '@racepilot/adapter-oidc';
const config = loadConfig(process.env);
await migrate(config.DATABASE_URL);
const { db } = await createDatabase(config.DATABASE_URL);
const org = await ensureCommunityOrganization(db, {
  slug: config.COMMUNITY_ORGANIZATION_SLUG,
  name: config.COMMUNITY_ORGANIZATION_NAME,
  timezone: config.COMMUNITY_ORGANIZATION_TIMEZONE,
  locale: config.COMMUNITY_ORGANIZATION_LOCALE,
});
const identityProvider =
  config.OIDC_PROVIDER === 'oidc'
    ? await createOIDCIdentityProvider({
        issuerUrl: config.OIDC_ISSUER_URL!,
        audience: config.OIDC_AUDIENCE!,
      })
    : undefined;
serve({
  fetch: createApp({
    config: { deploymentMode: 'community', organizationId: org.id },
    organizations: createOrganizationRepository(db),
    events: createEventRepository(db),
    classes: createEventClassRepository(db),
    memberships: createMembershipRepository(db),
    payments: createInvoicePaymentRepository(db),
    paymentRecipients: createPaymentRecipientRepository(db),
    pricing: createEventClassPricingRepository(db),
    ...(identityProvider
      ? {
          oidcClient: {
            issuerUrl: new URL(config.OIDC_ISSUER_URL!).href,
            clientId: config.OIDC_CLIENT_ID!,
            redirectUri: config.OIDC_REDIRECT_URI!,
          },
        }
      : {}),
    ...(identityProvider
      ? {
          authenticator: {
            authenticate: async (request: Request) => {
              if (!request.headers.get('authorization')?.startsWith('Bearer '))
                return null;
              try {
                return await identityProvider.verify(
                  request.headers.get('authorization')!.slice(7),
                );
              } catch {
                return null;
              }
            },
          },
          bootstrap: {
            issuer: new URL(config.OIDC_ISSUER_URL!).href,
            ...(config.OIDC_BOOTSTRAP_SUBJECT
              ? { subject: config.OIDC_BOOTSTRAP_SUBJECT }
              : {}),
            ...(config.OIDC_BOOTSTRAP_EMAIL
              ? { email: config.OIDC_BOOTSTRAP_EMAIL }
              : {}),
          },
        }
      : {}),
  }).fetch,
  port: config.PORT,
  hostname: '127.0.0.1',
});
