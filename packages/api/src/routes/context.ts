import { Hono } from 'hono';
import { RequestContext, DeploymentMode } from '@racepilot/core';
import {
  RegistrationRateLimitScope,
  RegistrationRateLimitResult,
} from '../rate-limit.js';
import { ApiDeps } from '../types.js';

export interface ApiRoutesContext {
  app: Hono;
  deps: ApiDeps;
  resolvePublicContext(request: Request): Promise<RequestContext | null>;
  resolveMemberContext(request: Request): Promise<RequestContext | null>;
  consumeRegistrationBudget(
    context: {
      env: unknown;
      req: { header(name: string): string | undefined };
    },
    scopes: readonly RegistrationRateLimitScope[],
  ): Promise<RegistrationRateLimitResult & { unavailable?: boolean }>;
  setRetryAfter(
    context: { header(name: string, value: string): void },
    retryAfterMs: number,
  ): void;
  rateLimitDefaults: {
    organizationLimit: number;
    eventLimit: number;
    windowSeconds: number;
  };
  mode: DeploymentMode;
  communityOrganizationId: string | undefined;
}
