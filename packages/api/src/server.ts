import { serve } from '@hono/node-server';
import { loadConfig } from './index.js';
import {
  createDatabase,
  migrate,
  ensureCommunityOrganization,
  createOrganizationRepository,
  createEventRepository,
} from '@racepilot/adapter-postgres';
import { createApp } from './index.js';
const config = loadConfig(process.env);
await migrate(config.DATABASE_URL);
const { db } = await createDatabase(config.DATABASE_URL);
const org = await ensureCommunityOrganization(db, {
  slug: config.COMMUNITY_ORGANIZATION_SLUG,
  name: config.COMMUNITY_ORGANIZATION_NAME,
  timezone: config.COMMUNITY_ORGANIZATION_TIMEZONE,
  locale: config.COMMUNITY_ORGANIZATION_LOCALE,
});
serve({
  fetch: createApp({
    config: { deploymentMode: 'community', organizationId: org.id },
    organizations: createOrganizationRepository(db),
    events: createEventRepository(db),
  }).fetch,
  port: config.PORT,
  hostname: '127.0.0.1',
});
