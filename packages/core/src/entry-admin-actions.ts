import type { RequestContext } from './context.js';

export type EntryAdminAction =
  | {
      readonly kind: 'change_class';
      readonly classId: string;
      readonly reason: string;
      readonly expectedVersion: number;
    }
  | {
      readonly kind: 'adjust_amount';
      readonly amountCents: number;
      readonly reason: string;
      readonly expectedVersion: number;
    }
  | {
      readonly kind: 'note';
      readonly visibility: 'internal' | 'driver';
      readonly text: string;
    }
  | {
      readonly kind: 'delete';
      readonly reason: string;
      readonly expectedVersion: number;
    };

export type EntryAdminActionResult =
  | { readonly status: 'updated' }
  | { readonly status: 'not_found' }
  | {
      readonly status: 'conflict';
      readonly reason: 'stale' | 'capacity' | 'class';
    }
  | {
      readonly status: 'invalid';
      readonly reason: 'reason' | 'amount' | 'note';
    };

export interface EntryAdminActionsRepository {
  availableActions(
    context: RequestContext,
    entryId: string,
  ): Promise<readonly string[]>;
  perform(
    context: RequestContext,
    entryId: string,
    action: EntryAdminAction,
    actor: string,
  ): Promise<EntryAdminActionResult>;
}

export async function performEntryAdminAction(
  context: RequestContext,
  entryId: string,
  action: EntryAdminAction,
  actor: string,
  repository: EntryAdminActionsRepository,
): Promise<EntryAdminActionResult | { readonly status: 'forbidden' }> {
  if (!context.permissions.has('entry:write')) return { status: 'forbidden' };
  if (!actor.trim()) return { status: 'forbidden' };
  if ('reason' in action && !action.reason.trim())
    return { status: 'invalid', reason: 'reason' };
  if (
    action.kind === 'adjust_amount' &&
    (!Number.isSafeInteger(action.amountCents) || action.amountCents < 0)
  )
    return { status: 'invalid', reason: 'amount' };
  if (action.kind === 'note' && !action.text.trim())
    return { status: 'invalid', reason: 'note' };
  return repository.perform(context, entryId, action, actor.trim());
}
