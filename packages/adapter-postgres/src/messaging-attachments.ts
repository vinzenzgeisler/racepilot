import { MESSAGE_ATTACHMENT_LIMITS } from '@racepilot/core';
import type {
  MessageCampaignSendResult,
  ObjectStorageProvider,
} from '@racepilot/core';
import type { OrganizationId } from '@racepilot/core';

export async function validateMessageAttachmentMetadata(
  storage: ObjectStorageProvider | undefined,
  organizationId: OrganizationId,
  attachments: readonly { objectId: string; filename: string }[],
): Promise<MessageCampaignSendResult | null> {
  if (attachments.length && (!storage || !storage.head))
    return {
      ok: false,
      error: {
        code: 'storage-unavailable',
        message: 'Attachment metadata storage is unavailable',
      },
    };
  let totalBytes = 0;
  for (const attachment of attachments) {
    const metadata = await storage!.head!(organizationId, attachment.objectId);
    if (!metadata || metadata.contentType !== 'application/pdf')
      return {
        ok: false,
        error: {
          code: 'attachment-unavailable',
          message: 'Attachment is unavailable or not a PDF',
        },
      };
    totalBytes += metadata.size;
    if (totalBytes > MESSAGE_ATTACHMENT_LIMITS.maxBytes)
      return {
        ok: false,
        error: {
          code: 'attachment-too-large',
          message: 'Attachments exceed the configured size limit',
        },
      };
  }
  return null;
}
