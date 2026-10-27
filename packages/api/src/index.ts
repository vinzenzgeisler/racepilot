import { organizationId, type OrganizationId } from '@racepilot/core';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@racepilot/contracts';

export function health(version: string): HealthResponse {
  return healthResponseSchema.parse({ status: 'ok', version });
}

export function resolveOrganizationId(value: string): OrganizationId {
  return organizationId(value);
}
