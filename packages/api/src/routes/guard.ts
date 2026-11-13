import type { RequestContext } from '@racepilot/core';

export type MemberGuardResult =
  | { readonly ok: true; readonly context: RequestContext }
  | {
      readonly ok: false;
      readonly status: 401 | 403;
      readonly error: 'Unauthorized' | 'Forbidden';
    };

/**
 * The one guard for admin routes: 401 without a verified member context, 403 when a
 * required permission is missing. Without `permission` only membership is required
 * and the use case enforces finer permissions itself.
 */
export function createMemberGuard(
  resolve: (request: Request) => Promise<RequestContext | null>,
) {
  return async (
    request: Request,
    permission?: string,
  ): Promise<MemberGuardResult> => {
    const context = await resolve(request);
    if (!context) return { ok: false, status: 401, error: 'Unauthorized' };
    if (permission !== undefined && !context.permissions.has(permission))
      return { ok: false, status: 403, error: 'Forbidden' };
    return { ok: true, context };
  };
}
