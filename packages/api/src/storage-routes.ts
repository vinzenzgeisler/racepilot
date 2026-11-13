import type { ObjectStorageProvider } from '@racepilot/core';
import {
  registerConfirmationRoutes,
  registerFormUploadRoutes,
} from './routes/artifact.js';
import type {
  ApiRoutesContext,
  PublicRegistrationRouteDeps,
} from './routes/context.js';
import { registerEntryDocumentFileRoutes } from './routes/documents.js';
import { registerExportStorageRoutes } from './routes/entry-exports.js';
import { registerMessageAttachmentRoutes } from './routes/messages.js';
import {
  registerPublicAssetRoute,
  registerRegistrationAssetRoutes,
} from './routes/registration.js';
import { registerCustomFieldUploadRoute } from './routes/registration-assets.js';

/**
 * Routes that read or write object storage. They are registered only when the
 * installation has storage, so a missing provider is visible at startup and not
 * as a runtime error. Registration-dependent routes also need that module.
 */
export function registerStorageRoutes(
  context: ApiRoutesContext,
  storage: ObjectStorageProvider,
  registration: PublicRegistrationRouteDeps | undefined,
): void {
  registerConfirmationRoutes(context);
  registerExportStorageRoutes(context, storage);
  registerEntryDocumentFileRoutes(context, storage);
  registerMessageAttachmentRoutes(context, storage);
  registerRegistrationAssetRoutes(context, storage);
  if (!registration) return;
  registerFormUploadRoutes(context, storage, registration.service);
  registerPublicAssetRoute(context, storage, registration.service);
  registerCustomFieldUploadRoute(context, registration, storage);
}
