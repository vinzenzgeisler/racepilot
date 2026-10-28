import { run } from 'graphile-worker';
import {
  createDatabase,
  createMailOutboxRepository,
  organizations,
} from '@racepilot/adapter-postgres';
import { createSmtpMailProvider } from '@racepilot/adapter-smtp';
import { validateMailConfig } from '@racepilot/contracts';
import { and, eq } from 'drizzle-orm';
import { createMailOutboxTask } from './mail.js';
import { createArtifactTask } from './artifacts.js';
import { composeWorkerTasks } from './index.js';
import { createLocalObjectStorage } from '@racepilot/adapter-local-storage';
import { createS3ObjectStorage } from '@racepilot/adapter-s3';
import {
  createArtifactJobRepository,
  createEntryConfirmationRepository,
  createEntryExportRepository,
  createOrganizationRepository,
  createPaymentRecipientRepository,
} from '@racepilot/adapter-postgres';

const env = process.env;
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const mode = env.DEPLOYMENT_MODE;
if (mode !== 'community' && mode !== 'cloud')
  throw new Error('Invalid DEPLOYMENT_MODE');
const mailConfig = validateMailConfig(env);
const mailEnabled =
  mailConfig.MAIL_PROVIDER === 'smtp' && Boolean(mailConfig.CANONICAL_BASE_URL);
const smtpTimeoutMs = 30_000;
const leaseMs = Number(env.MAIL_OUTBOX_LEASE_MS ?? 300_000);
if (!Number.isSafeInteger(leaseMs) || leaseMs <= smtpTimeoutMs * 3)
  throw new Error('MAIL_OUTBOX_LEASE_MS must be greater than the SMTP timeout');
let mail;
if (mailEnabled) {
  mail = createSmtpMailProvider({
    host: mailConfig.SMTP_HOST!,
    port: mailConfig.SMTP_PORT!,
    secure: mailConfig.SMTP_SECURE === 'true',
    from: mailConfig.SMTP_FROM!,
    ...(mailConfig.SMTP_USER
      ? { user: mailConfig.SMTP_USER, password: mailConfig.SMTP_PASSWORD! }
      : {}),
  });
}
console.info(
  `Mail delivery capability: ${mailEnabled ? 'enabled' : 'disabled (SMTP or CANONICAL_BASE_URL is not fully configured)'}`,
);
const { db, pool } = await createDatabase(databaseUrl);
const storageProvider = env.STORAGE_PROVIDER ?? 'disabled';
if (!['disabled', 'local', 's3'].includes(storageProvider))
  throw new Error('Invalid STORAGE_PROVIDER');
if (storageProvider === 'local' && !env.STORAGE_LOCAL_ROOT)
  throw new Error('STORAGE_LOCAL_ROOT is required');
if (storageProvider === 's3' && !env.STORAGE_S3_BUCKET)
  throw new Error('STORAGE_S3_BUCKET is required');
if (
  Boolean(env.STORAGE_S3_ACCESS_KEY_ID) !==
  Boolean(env.STORAGE_S3_SECRET_ACCESS_KEY)
)
  throw new Error(
    'STORAGE_S3_ACCESS_KEY_ID and STORAGE_S3_SECRET_ACCESS_KEY must be supplied together',
  );
const storage =
  storageProvider === 'local'
    ? createLocalObjectStorage(env.STORAGE_LOCAL_ROOT ?? '')
    : storageProvider === 's3' && env.STORAGE_S3_BUCKET
      ? createS3ObjectStorage({
          bucket: env.STORAGE_S3_BUCKET,
          ...(env.STORAGE_S3_REGION ? { region: env.STORAGE_S3_REGION } : {}),
          ...(env.STORAGE_S3_ENDPOINT
            ? { endpoint: env.STORAGE_S3_ENDPOINT }
            : {}),
          ...(env.STORAGE_S3_ACCESS_KEY_ID && env.STORAGE_S3_SECRET_ACCESS_KEY
            ? {
                credentials: {
                  accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
                  secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
                },
              }
            : {}),
        })
      : undefined;
if (storageProvider !== 'disabled' && !storage)
  throw new Error('Artifact storage configuration is incomplete');
let communityOrganizationId: string | undefined;
if (mode === 'community') {
  const slug = env.COMMUNITY_ORGANIZATION_SLUG;
  if (!slug) throw new Error('COMMUNITY_ORGANIZATION_SLUG is required');
  const [organization] = await db
    .select({ id: organizations.id, status: organizations.status })
    .from(organizations)
    .where(
      and(eq(organizations.slug, slug), eq(organizations.status, 'active')),
    );
  if (!organization)
    throw new Error('Configured community organization is unavailable');
  communityOrganizationId = organization.id;
}
const taskList = composeWorkerTasks({
  ...(storage
    ? {
        artifact_generate: createArtifactTask({
          deploymentMode: mode,
          ...(communityOrganizationId ? { communityOrganizationId } : {}),
          getOrganization: async (id) => {
            const [organization] = await db
              .select({ status: organizations.status })
              .from(organizations)
              .where(eq(organizations.id, id));
            return organization ?? null;
          },
          jobs: createArtifactJobRepository(db),
          organizations: createOrganizationRepository(db),
          confirmations: createEntryConfirmationRepository(db),
          exports: createEntryExportRepository(db),
          storage: storage!,
          paymentRecipients: createPaymentRecipientRepository(db),
        }),
      }
    : {}),
  ...(mailEnabled
    ? {
        mail_outbox: createMailOutboxTask({
          deploymentMode: mode,
          ...(communityOrganizationId ? { communityOrganizationId } : {}),
          getOrganization: async (id) => {
            const [organization] = await db
              .select({ status: organizations.status })
              .from(organizations)
              .where(eq(organizations.id, id));
            return organization ?? null;
          },
          repository: createMailOutboxRepository(db, { leaseMs }),
          mail: mail!,
          canonicalBaseUrl: mailConfig.CANONICAL_BASE_URL!,
        }),
      }
    : {}),
});
const runner = await run({ connectionString: databaseUrl, taskList });
const stop = async () => {
  await runner.stop();
  await pool.end();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
