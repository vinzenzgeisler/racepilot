import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { organizationId, ProviderError } from '@racepilot/core';
import { createLocalObjectStorage } from './index.js';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
describe('local object storage port contract', () => {
  it('round-trips an object and enforces organization-scoped access', async () => {
    root = await mkdtemp(join(tmpdir(), 'racepilot-storage-'));
    const storage = createLocalObjectStorage(root);
    const owner = organizationId('org_a');
    const ref = await storage.put({
      organizationId: owner,
      body: new TextEncoder().encode('hello'),
      contentType: 'text/plain',
    });
    expect(ref.objectId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await storage.get(owner, ref.objectId))?.ref.sha256).toHaveLength(
      64,
    );
    expect(await storage.get(organizationId('org_b'), ref.objectId)).toBeNull();
    await expect(storage.get(owner, '../etc/passwd')).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });
  it('rejects a missing root', () =>
    expect(() => createLocalObjectStorage('')).toThrowError(ProviderError));
});
