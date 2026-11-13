import { serve } from '@hono/node-server';
import {
  createDatabase,
  ensureCommunityOrganization,
  getOrganizationMailConfiguration,
  migrate,
} from '@racepilot/adapter-postgres';
import { loadConfig } from './config.js';
import {
  createCommunityIdentity,
  createCommunityObjectStorage,
} from './community-providers.js';
import { createProductApi } from './product.js';

const config = loadConfig(process.env);
await migrate(config.DATABASE_URL);
const { db } = await createDatabase(config.DATABASE_URL);
const organization = await ensureCommunityOrganization(db, {
  slug: config.COMMUNITY_ORGANIZATION_SLUG,
  name: config.COMMUNITY_ORGANIZATION_NAME,
  timezone: config.COMMUNITY_ORGANIZATION_TIMEZONE,
  locale: config.COMMUNITY_ORGANIZATION_LOCALE,
});
const organizationMail = config.mailEnabled
  ? await getOrganizationMailConfiguration(db, organization.id)
  : null;
const identity = await createCommunityIdentity(config);
const objectStorage = createCommunityObjectStorage(config);
const app = createProductApi({
  db,
  edition: {
    deploymentMode: 'community',
    organizationId: organization.id,
    ...(identity
      ? {
          authentication: {
            authenticator: identity.authenticator,
            bootstrap: identity.bootstrap,
          },
        }
      : {}),
  },
  ...(objectStorage ? { objectStorage } : {}),
  ...(config.CANONICAL_BASE_URL
    ? { canonicalBaseUrl: config.CANONICAL_BASE_URL }
    : {}),
  mailEnabled: config.mailEnabled,
  capabilities: organizationMail ? ['mail.delivery'] : [],
  ...(identity ? { oidcClient: identity.oidcClient } : {}),
  rateLimits: {
    TRUSTED_PROXIES: config.TRUSTED_PROXIES,
    PUBLIC_REGISTRATION_ORG_LIMIT: config.PUBLIC_REGISTRATION_ORG_LIMIT,
    PUBLIC_REGISTRATION_EVENT_LIMIT: config.PUBLIC_REGISTRATION_EVENT_LIMIT,
    PUBLIC_REGISTRATION_WINDOW_SECONDS:
      config.PUBLIC_REGISTRATION_WINDOW_SECONDS,
  },
});
serve({ fetch: app.fetch, port: config.PORT, hostname: '127.0.0.1' });
