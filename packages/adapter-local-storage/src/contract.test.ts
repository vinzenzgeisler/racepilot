import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProviderError, verifyObjectStorageContract } from '@racepilot/core';
import { createLocalObjectStorage } from './index.js';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
describe('local object storage port contract', () => {
  it('satisfies the shared object storage contract', async () => {
    root = await mkdtemp(join(tmpdir(), 'racepilot-storage-'));
    await verifyObjectStorageContract(createLocalObjectStorage(root));
  });
  it('rejects a missing root', () =>
    expect(() => createLocalObjectStorage('')).toThrowError(ProviderError));
});
