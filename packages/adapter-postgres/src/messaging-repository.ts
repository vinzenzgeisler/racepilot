import type { ObjectStorageProvider } from '@racepilot/core';
import type { Database } from './database.js';
import { createMessageCampaignRepository } from './messaging-campaigns.js';
import { createMessageQuickActions } from './messaging-quick-actions.js';
import { createMessageSender } from './messaging-send.js';
import { createMessageTemplateRepository } from './messaging-templates.js';

export function createMessageRepository(
  db: Database,
  storage?: ObjectStorageProvider,
  canonicalBaseUrl?: string,
) {
  return {
    ...createMessageTemplateRepository(db),
    ...createMessageCampaignRepository(db),
    send: createMessageSender(db, storage),
    quickAction: createMessageQuickActions(db, canonicalBaseUrl),
  };
}
