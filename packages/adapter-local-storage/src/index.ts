import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { ObjectStorageProvider, StoredObjectRef } from '@racepilot/core';
import { organizationId, ProviderError } from '@racepilot/core';
import { z } from 'zod';

const StoredObjectRefSchema = z.object({
  organizationId: z.string().min(1),
  objectId: z.string().uuid(),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

function parseStoredObjectRef(metadata: string): StoredObjectRef {
  const parsed = StoredObjectRefSchema.parse(JSON.parse(metadata));
  return { ...parsed, organizationId: organizationId(parsed.organizationId) };
}

function hasErrorCode(cause: unknown, code: string): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === code
  );
}

export function createLocalObjectStorage(root: string): ObjectStorageProvider {
  if (!root.trim())
    throw new ProviderError('not_configured', 'Local storage root is required');
  const base = resolve(root);
  function objectPath(org: string, id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(org) || !/^[0-9a-f-]{36}$/.test(id))
      throw new ProviderError('invalid_input', 'Invalid object reference');
    const path = resolve(base, 'organization', org, id);
    const rel = relative(base, path);
    if (
      rel.startsWith(`..${sep}`) ||
      rel === '..' ||
      resolve(base, rel) !== path
    )
      throw new ProviderError('invalid_input', 'Invalid object reference');
    return path;
  }
  return {
    async put({ organizationId, body, contentType }) {
      const objectId = randomUUID();
      const path = objectPath(organizationId, objectId);
      const ref: StoredObjectRef = {
        organizationId,
        objectId,
        contentType,
        size: body.byteLength,
        sha256: createHash('sha256').update(body).digest('hex'),
      };
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temp = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, body, { flag: 'wx', mode: 0o600 });
        await rename(temp, path);
        await writeFile(`${path}.json`, JSON.stringify(ref), {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (cause) {
        await rm(temp, { force: true });
        await rm(path, { force: true });
        throw new ProviderError('unavailable', 'Object storage write failed', {
          cause,
        });
      }
      return ref;
    },
    async head(organizationId, objectId) {
      const path = objectPath(organizationId, objectId);
      try {
        const metadata = await readFile(`${path}.json`, 'utf8');
        const ref = parseStoredObjectRef(metadata);
        if (ref.organizationId !== organizationId || ref.objectId !== objectId)
          throw new ProviderError('forbidden', 'Object ownership check failed');
        return ref;
      } catch (cause) {
        if (cause instanceof ProviderError) throw cause;
        if (hasErrorCode(cause, 'ENOENT')) return null;
        throw new ProviderError('unavailable', 'Object metadata read failed', {
          cause,
        });
      }
    },
    async get(organizationId, objectId) {
      const path = objectPath(organizationId, objectId);
      try {
        const [metadata, body] = await Promise.all([
          readFile(`${path}.json`, 'utf8'),
          readFile(path),
        ]);
        const ref = parseStoredObjectRef(metadata);
        if (ref.organizationId !== organizationId || ref.objectId !== objectId)
          throw new ProviderError('forbidden', 'Object ownership check failed');
        if (ref.sha256 !== createHash('sha256').update(body).digest('hex'))
          throw new ProviderError('unavailable', 'Object checksum mismatch');
        return { ref, body };
      } catch (cause) {
        if (cause instanceof ProviderError) throw cause;
        if (hasErrorCode(cause, 'ENOENT')) return null;
        throw new ProviderError('unavailable', 'Object storage read failed', {
          cause,
        });
      }
    },
    async delete(organizationId, objectId) {
      const path = objectPath(organizationId, objectId);
      const object = await this.get(organizationId, objectId);
      if (!object) return;
      await Promise.all([rm(path), rm(`${path}.json`)]).catch(
        (cause: unknown) => {
          throw new ProviderError(
            'unavailable',
            'Object storage delete failed',
            { cause },
          );
        },
      );
    },
  };
}
