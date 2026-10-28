import { createHash, randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectStorageProvider, StoredObjectRef } from '@racepilot/core';
import { organizationId, ProviderError } from '@racepilot/core';

export interface S3ObjectStorageConfig {
  readonly bucket: string;
  readonly region?: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  readonly credentials?: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
}

export function createS3ObjectStorage(
  config: S3ObjectStorageConfig,
): ObjectStorageProvider {
  if (!config.bucket.trim())
    throw new ProviderError('not_configured', 'S3 bucket is required');
  const client = new S3Client({
    region: config.region ?? 'us-east-1',
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
    ...(config.credentials ? { credentials: config.credentials } : {}),
  });
  const keyFor = (org: string, id: string) => {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(org) || !/^[0-9a-f-]{36}$/.test(id))
      throw new ProviderError('invalid_input', 'Invalid object reference');
    return `organization/${org}/${id}`;
  };
  return {
    async put({ organizationId: owner, body, contentType }) {
      const objectId = randomUUID();
      const sha256 = createHash('sha256').update(body).digest('hex');
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: keyFor(owner, objectId),
            Body: body,
            ContentType: contentType,
            Metadata: { organizationid: owner, objectid: objectId, sha256 },
          }),
        );
      } catch (cause) {
        throw new ProviderError('unavailable', 'Object storage write failed', {
          cause,
        });
      }
      return {
        organizationId: owner,
        objectId,
        contentType,
        size: body.byteLength,
        sha256,
      } satisfies StoredObjectRef;
    },
    async get(owner, objectId) {
      const key = keyFor(owner, objectId);
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        if (!result.Body) return null;
        const body = await result.Body.transformToByteArray();
        if (
          result.Metadata?.organizationid !== owner ||
          result.Metadata?.objectid !== objectId
        )
          throw new ProviderError('forbidden', 'Object ownership check failed');
        const sha256 = createHash('sha256').update(body).digest('hex');
        if (result.Metadata.sha256 !== sha256)
          throw new ProviderError('unavailable', 'Object checksum mismatch');
        return {
          ref: {
            organizationId: organizationId(owner),
            objectId,
            contentType: result.ContentType ?? 'application/octet-stream',
            size: body.byteLength,
            sha256,
          },
          body,
        };
      } catch (cause) {
        if (cause instanceof ProviderError) throw cause;
        if (
          (cause as { name?: string }).name === 'NoSuchKey' ||
          (cause as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
        )
          return null;
        throw new ProviderError('unavailable', 'Object storage read failed', {
          cause,
        });
      }
    },
    async delete(owner, objectId) {
      const key = keyFor(owner, objectId);
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        );
      } catch (cause) {
        throw new ProviderError('unavailable', 'Object storage delete failed', {
          cause,
        });
      }
    },
  };
}
