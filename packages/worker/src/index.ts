import { parseDeploymentMode, type DeploymentMode } from '@racepilot/core';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@racepilot/contracts';

export function processHealthCheck(version: string): HealthResponse {
  return healthResponseSchema.parse({ status: 'ok', version });
}

/** Fixes the deployment mode from server configuration at process startup. */
export function deploymentModeFromConfig(configured: string): DeploymentMode {
  return parseDeploymentMode(configured);
}
