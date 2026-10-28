import { run } from 'graphile-worker';
import {
  createDatabase,
  createMailOutboxRepository,
  organizations,
} from '@racepilot/adapter-postgres';
import { createSmtpMailProvider } from '@racepilot/adapter-smtp';
import { eq } from 'drizzle-orm';
import { createMailOutboxTask, type MailOutboxRepository } from './mail.js';

const env = process.env;
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const mode = env.DEPLOYMENT_MODE;
if (mode !== 'community' && mode !== 'cloud')
  throw new Error('Invalid DEPLOYMENT_MODE');
const mailProvider = env.MAIL_PROVIDER ?? 'disabled';
if (mailProvider !== 'disabled' && mailProvider !== 'smtp')
  throw new Error('Invalid MAIL_PROVIDER');
const canonicalBaseUrl = env.CANONICAL_BASE_URL;
const mailEnabled = mailProvider === 'smtp' && Boolean(canonicalBaseUrl);
let mail;
if (mailEnabled) {
  if (
    !env.SMTP_HOST ||
    !env.SMTP_PORT ||
    !env.SMTP_FROM ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SMTP_FROM) ||
    Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)
  )
    throw new Error(
      'Invalid mail configuration: SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD',
    );
  const base = new URL(canonicalBaseUrl!);
  if (
    !['https:', 'http:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    (base.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(base.hostname))
  )
    throw new Error('Invalid mail configuration: CANONICAL_BASE_URL');
  mail = createSmtpMailProvider({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === 'true',
    from: env.SMTP_FROM,
    ...(env.SMTP_USER
      ? { user: env.SMTP_USER, password: env.SMTP_PASSWORD! }
      : {}),
  });
}
console.info(
  `Mail delivery capability: ${mailEnabled ? 'enabled' : 'disabled (SMTP or CANONICAL_BASE_URL is not fully configured)'}`,
);
const { db, pool } = await createDatabase(databaseUrl);
const taskList = mailEnabled
  ? {
      mail_outbox: createMailOutboxTask({
        deploymentMode: mode,
        ...(env.COMMUNITY_ORGANIZATION_ID
          ? { communityOrganizationId: env.COMMUNITY_ORGANIZATION_ID }
          : {}),
        getOrganization: async (id) => {
          const [organization] = await db
            .select({ status: organizations.status })
            .from(organizations)
            .where(eq(organizations.id, id));
          return organization ?? null;
        },
        repository: createMailOutboxRepository(
          db,
        ) as unknown as MailOutboxRepository,
        mail: mail!,
        canonicalBaseUrl: canonicalBaseUrl!,
      }),
    }
  : {};
const runner = await run({ connectionString: databaseUrl, taskList });
const stop = async () => {
  await runner.stop();
  await pool.end();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
