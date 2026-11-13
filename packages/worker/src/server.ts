import { run } from 'graphile-worker';
import { and, eq } from 'drizzle-orm';
import { createDatabase, organizations } from '@racepilot/adapter-postgres';
import { createSmtpMailProvider } from '@racepilot/adapter-smtp';
import { validateMailConfig } from '@racepilot/contracts';
import { staticCanonicalOrigin } from '@racepilot/core';
import { createProductWorker, type ProductWorkerEdition } from './product.js';
import { readStorageConfiguration } from './community-storage.js';

const env = process.env;
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const mode = env.DEPLOYMENT_MODE;
if (mode !== 'community' && mode !== 'cloud')
  throw new Error('Invalid DEPLOYMENT_MODE');
const mailConfig = validateMailConfig(env);
const canonicalBaseUrl = mailConfig.CANONICAL_BASE_URL;
const smtpTimeoutMs = 30_000;
const leaseMs = Number(env.MAIL_OUTBOX_LEASE_MS ?? 300_000);
if (!Number.isSafeInteger(leaseMs) || leaseMs <= smtpTimeoutMs * 3)
  throw new Error('MAIL_OUTBOX_LEASE_MS must be greater than the SMTP timeout');
const smtp =
  mailConfig.MAIL_PROVIDER === 'smtp' && canonicalBaseUrl
    ? createSmtpMailProvider({
        host: mailConfig.SMTP_HOST ?? '',
        port: mailConfig.SMTP_PORT ?? 0,
        secure: mailConfig.SMTP_SECURE === 'true',
        from: mailConfig.SMTP_FROM ?? '',
        ...(mailConfig.SMTP_USER
          ? {
              user: mailConfig.SMTP_USER,
              password: mailConfig.SMTP_PASSWORD ?? '',
            }
          : {}),
      })
    : undefined;
console.info(
  `Mail delivery capability: ${smtp ? 'enabled' : 'disabled (SMTP or CANONICAL_BASE_URL is not fully configured)'}`,
);
const { db, pool } = await createDatabase(databaseUrl);
const storage = readStorageConfiguration(env);

async function readEdition(): Promise<ProductWorkerEdition> {
  if (mode === 'cloud') return { deploymentMode: 'cloud' };
  const slug = env.COMMUNITY_ORGANIZATION_SLUG;
  if (!slug) throw new Error('COMMUNITY_ORGANIZATION_SLUG is required');
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(eq(organizations.slug, slug), eq(organizations.status, 'active')),
    );
  if (!organization)
    throw new Error('Configured community organization is unavailable');
  return { deploymentMode: 'community', organizationId: organization.id };
}

const { taskList } = createProductWorker({
  db,
  edition: await readEdition(),
  ...(storage ? { storage } : {}),
  ...(smtp && canonicalBaseUrl
    ? {
        mail: {
          provider: smtp,
          canonicalOrigin: staticCanonicalOrigin(canonicalBaseUrl),
          leaseMs,
        },
      }
    : {}),
  onRejected: (task, reason) => console.warn(`Rejected job ${task}: ${reason}`),
});
const runner = await run({ connectionString: databaseUrl, taskList });
const stop = async () => {
  await runner.stop();
  await pool.end();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
