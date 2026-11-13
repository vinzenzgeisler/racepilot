import { Hono } from 'hono';
import { RequestContext, DeploymentMode } from '@racepilot/core';
import {
  RegistrationRateLimitScope,
  RegistrationRateLimitResult,
} from '../rate-limit.js';
import type { ApiDeps } from '../types.js';
import type { PublicRegistrationService } from '../services.js';
import type { MemberGuardResult } from './guard.js';

export interface ApiRoutesContext {
  app: Hono;
  deps: ApiDeps;
  resolvePublicContext(request: Request): Promise<RequestContext | null>;
  /** Shared guard: a verified member context, optionally with one required permission. */
  requireMember(
    request: Request,
    permission?: string,
  ): Promise<MemberGuardResult>;
  mode: DeploymentMode;
  communityOrganizationId: string | undefined;
}

/** Public registration: the service plus the rate-limit budget that protects it. */
export interface PublicRegistrationRouteDeps {
  service: PublicRegistrationService;
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
}
