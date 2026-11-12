import type { RequestContext } from '@racepilot/core';

export type MemberGuardResult =
  | { readonly ok: true; readonly context: RequestContext }
  | {
      readonly ok: false;
      readonly status: 401 | 403;
      readonly error: 'Unauthorized' | 'Forbidden';
    };

export async function requireMemberPermission(
  request: Request,
  resolve: (request: Request) => Promise<RequestContext | null>,
  permission: string,
): Promise<MemberGuardResult> {
  const context = await resolve(request);
  if (!context) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!context.permissions.has(permission))
    return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, context };
}
