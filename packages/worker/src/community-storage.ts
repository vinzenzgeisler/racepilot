import { createLocalObjectStorage } from '@racepilot/adapter-local-storage';
import { createS3ObjectStorage } from '@racepilot/adapter-s3';
import type { ObjectStorageProvider } from '@racepilot/core';

/** Reads the operator-selected object storage from the environment; fails closed when incomplete. */
export function readStorageConfiguration(
  env: NodeJS.ProcessEnv,
): ObjectStorageProvider | undefined {
  const provider = env.STORAGE_PROVIDER ?? 'disabled';
  if (!['disabled', 'local', 's3'].includes(provider))
    throw new Error('Invalid STORAGE_PROVIDER');
  if (
    Boolean(env.STORAGE_S3_ACCESS_KEY_ID) !==
    Boolean(env.STORAGE_S3_SECRET_ACCESS_KEY)
  )
    throw new Error(
      'STORAGE_S3_ACCESS_KEY_ID and STORAGE_S3_SECRET_ACCESS_KEY must be supplied together',
    );
  if (provider === 'local') {
    if (!env.STORAGE_LOCAL_ROOT)
      throw new Error('STORAGE_LOCAL_ROOT is required');
    return createLocalObjectStorage(env.STORAGE_LOCAL_ROOT);
  }
  if (provider === 's3') {
    if (!env.STORAGE_S3_BUCKET)
      throw new Error('STORAGE_S3_BUCKET is required');
    return createS3ObjectStorage({
      bucket: env.STORAGE_S3_BUCKET,
      ...(env.STORAGE_S3_REGION ? { region: env.STORAGE_S3_REGION } : {}),
      ...(env.STORAGE_S3_ENDPOINT ? { endpoint: env.STORAGE_S3_ENDPOINT } : {}),
      ...(env.STORAGE_S3_ACCESS_KEY_ID && env.STORAGE_S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
              secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return undefined;
}
