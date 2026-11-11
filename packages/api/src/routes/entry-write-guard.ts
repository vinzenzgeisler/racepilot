import type { RequestContext } from '@racepilot/core';
import type { ApiRoutesContext } from './context.js';

type EntryWriterGuard =
  | { readonly ok: true; readonly context: RequestContext }
  | { readonly ok: false; readonly status: 401 | 403; readonly error: string };

export async function requireEntryWriter(
  request: Request,
  resolveMemberContext: ApiRoutesContext['resolveMemberContext'],
): Promise<EntryWriterGuard> {
  const context = await resolveMemberContext(request);
  if (!context) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!context.permissions.has('entry:write'))
    return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, context };
}
