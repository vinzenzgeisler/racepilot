import { describe, expect, it } from 'vitest';
import { organizationId } from '@racepilot/core';
import { createS3ObjectStorage } from './index.js';

const endpoint = process.env.RACEPILOT_S3_TEST_ENDPOINT;
const bucket = process.env.RACEPILOT_S3_TEST_BUCKET;
describe.skipIf(!endpoint || !bucket)('S3 object storage port contract', () => {
  it('round-trips and scopes objects to organization namespaces', async () => {
    const storage = createS3ObjectStorage({
      endpoint: endpoint!,
      bucket: bucket!,
      region: process.env.RACEPILOT_S3_TEST_REGION ?? 'us-east-1',
      forcePathStyle: true,
      ...(process.env.RACEPILOT_S3_TEST_ACCESS_KEY &&
      process.env.RACEPILOT_S3_TEST_SECRET_KEY
        ? {
            credentials: {
              accessKeyId: process.env.RACEPILOT_S3_TEST_ACCESS_KEY,
              secretAccessKey: process.env.RACEPILOT_S3_TEST_SECRET_KEY,
            },
          }
        : {}),
    });
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
    await storage.delete(owner, ref.objectId);
  });
});
