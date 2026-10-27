import { organizationId, type OrganizationId } from '@racepilot/core';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@racepilot/contracts';

export function processHealthCheck(version: string): HealthResponse {
  const organization: OrganizationId = organizationId('system');
  void organization;
  return healthResponseSchema.parse({ status: 'ok', version });
}
