import type { RequestContext } from '@racepilot/core';
import type { TransactionDatabase } from './database.js';
import type { PublicRegistrationPayload } from './registration-settings.js';
import type { events } from './schema/organization.js';

export type RegistrationSubmissionEvent = typeof events.$inferSelect;
export type RegistrationSubmissionTransaction = TransactionDatabase;
export type RegistrationSubmissionContext = {
  ctx: RequestContext;
  event: RegistrationSubmissionEvent;
  payload: PublicRegistrationPayload;
  tx: TransactionDatabase;
  receivedAt: Date;
};
export type RegistrationSubmissionSettings = {
  sharedContactEmail: 'allowed' | 'disallowed';
  minimumAge: number | null;
  guardianRequiredBelowAge: number;
  maximumClassesPerGroup: number;
};
export type RegistrationCustomField = {
  key: string;
  type: 'text' | 'select' | 'yes_no' | 'file';
  required: boolean;
  options?: Array<{ value: string }>;
};
export type RegistrationFileUploadReference = {
  fieldKey: string;
  objectId: string;
  tokenHash: string;
};
