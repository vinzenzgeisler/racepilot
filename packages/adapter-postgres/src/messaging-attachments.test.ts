import { describe, expect, it, vi } from 'vitest';
import { organizationId } from '@racepilot/core';
import type { ObjectStorageProvider } from '@racepilot/core';
import { MESSAGE_ATTACHMENT_LIMITS } from '@racepilot/contracts';
import { validateMessageAttachmentMetadata } from './messaging-attachments.js';

const tenantId = organizationId('tenant-a');
const attachment = {
  objectId: '00000000-0000-4000-8000-000000000001',
  filename: 'rules.pdf',
};
const ref = (size = 100, contentType = 'application/pdf') => ({
  organizationId: tenantId,
  objectId: attachment.objectId,
  contentType,
  size,
  sha256: 'a'.repeat(64),
});

function storage(
  head: NonNullable<ObjectStorageProvider['head']>,
): ObjectStorageProvider {
  return {
    put: async () => ref(),
    head,
    get: vi.fn(async () => {
      throw new Error('full object read must not be used for validation');
    }),
    delete: async () => {},
  };
}

describe('message attachment metadata validation', () => {
  it('uses head metadata only to validate ownership-scoped PDFs', async () => {
    const head = vi.fn(async () => ref());
    expect(
      await validateMessageAttachmentMetadata(storage(head), tenantId, [
        attachment,
      ]),
    ).toEqual({ ok: true });
    expect(head).toHaveBeenCalledWith(tenantId, attachment.objectId);
  });

  it('rejects missing and non-PDF metadata with typed reasons', async () => {
    expect(
      await validateMessageAttachmentMetadata(
        storage(async () => null),
        tenantId,
        [attachment],
      ),
    ).toMatchObject({ ok: false, error: { code: 'attachment-unavailable' } });
    expect(
      await validateMessageAttachmentMetadata(
        storage(async () => ref(100, 'text/plain')),
        tenantId,
        [attachment],
      ),
    ).toMatchObject({ ok: false, error: { code: 'attachment-unavailable' } });
  });

  it('rejects cumulative attachment size above the configured limit', async () => {
    expect(
      await validateMessageAttachmentMetadata(
        storage(async () => ref(MESSAGE_ATTACHMENT_LIMITS.maxBytes)),
        tenantId,
        [
          attachment,
          { ...attachment, objectId: '00000000-0000-4000-8000-000000000002' },
        ],
      ),
    ).toMatchObject({ ok: false, error: { code: 'attachment-too-large' } });
  });
});
