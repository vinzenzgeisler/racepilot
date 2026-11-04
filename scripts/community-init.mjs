import {
  createDatabase,
  ensureCommunityOrganization,
  getOrganizationMailConfiguration,
  migrate,
  setOrganizationMailConfiguration,
} from '../packages/adapter-postgres/dist/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
await migrate(databaseUrl);
const { db, pool } = await createDatabase(databaseUrl);
try {
  const organization = await ensureCommunityOrganization(db, {
    slug: process.env.COMMUNITY_ORGANIZATION_SLUG,
    name: process.env.COMMUNITY_ORGANIZATION_NAME,
    timezone: process.env.COMMUNITY_ORGANIZATION_TIMEZONE,
    locale: process.env.COMMUNITY_ORGANIZATION_LOCALE,
  });
  if (!(await getOrganizationMailConfiguration(db, organization.id))) {
    await setOrganizationMailConfiguration(db, organization.id, {
      from: process.env.SMTP_FROM,
    });
  }
} finally {
  await pool.end();
}
