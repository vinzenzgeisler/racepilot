import { assertWorkflowTransition } from './status-projection.js';
import { Entry } from './entries-model.js';
import { EntryAcceptanceStatus } from './workflow-model.js';
import { EntryRepository } from './entries-model.js';
import { EntryVerificationStatus } from './workflow-model.js';
import { EntryWorkflowCategory } from './workflow-model.js';
import { EntryWorkflowRepository } from './workflow-model.js';
import { RequestContext } from './context.js';

const verificationTransitions: Record<
  EntryVerificationStatus,
  readonly EntryVerificationStatus[]
> = { unverified: ['verified'], verified: [] };

const acceptanceTransitions: Record<
  EntryAcceptanceStatus,
  readonly EntryAcceptanceStatus[]
> = {
  pending: ['accepted', 'rejected', 'waitlisted', 'withdrawn'],
  accepted: ['withdrawn'],
  rejected: ['withdrawn'],
  // Manual promotion from the waitlist; automatic waitlist handling is #29.
  waitlisted: ['accepted', 'rejected', 'withdrawn'],
  withdrawn: [],
};

export function assertEntryTransition(
  kind: 'verification' | 'acceptance',
  from: string,
  to: string,
): void {
  const allowed =
    kind === 'verification'
      ? verificationTransitions[from as EntryVerificationStatus]
      : acceptanceTransitions[from as EntryAcceptanceStatus];
  if (!allowed?.includes(to as never))
    throw new Error(`Invalid entry ${kind} transition: ${from} -> ${to}`);
}

export async function transitionEntry(
  ctx: RequestContext,
  id: string,
  kind: 'verification' | 'acceptance',
  to: string,
  actor: string,
  reason: string,
  deps: { entries: EntryRepository; workflows?: EntryWorkflowRepository },
): Promise<Entry | null> {
  // Workflow role claims may further restrict entry writers, but must never
  // grant tenant-wide write access to entries.
  if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
  if (!actor.trim()) throw new Error('Transition actor is required');
  const current = await deps.entries.getById(ctx, id);
  if (!current) return null;
  const from =
    kind === 'verification'
      ? current.verificationStatus
      : current.acceptanceStatus;
  let statusCategory: EntryWorkflowCategory | undefined;
  let workflowRevisionId: string | undefined;
  let notification:
    | { statusKey: string; statusLabelDe: string; statusLabelEn: string }
    | undefined;
  if (kind === 'acceptance' && deps.workflows) {
    const pinned = await deps.workflows.getPinnedForEntry(ctx, id);
    if (!pinned) return null;
    assertWorkflowTransition(pinned.workflow, from, to, reason);
    const workflowEdge = pinned.workflow.transitions.find(
      (edge) => edge.from === from && edge.to === to,
    )!;
    if (
      workflowEdge.roles?.length &&
      !workflowEdge.roles.some((role) => ctx.permissions.has(`role:${role}`))
    )
      throw new Error('Forbidden');
    if (
      workflowEdge.permission &&
      !ctx.permissions.has(workflowEdge.permission)
    )
      throw new Error('Forbidden');
    statusCategory = pinned.workflow.statuses.find(
      (status) => status.key === to,
    )?.category;
    if (!statusCategory) throw new Error(`Unknown entry status: ${to}`);
    workflowRevisionId = pinned.id;
    if (workflowEdge.notify) {
      const targetStatus = pinned.workflow.statuses.find(
        (status) => status.key === to,
      )!;
      notification = {
        statusKey: targetStatus.key,
        statusLabelDe: targetStatus.labels.de,
        statusLabelEn: targetStatus.labels.en,
      };
    }
  } else {
    assertEntryTransition(kind, from, to);
    if (!reason.trim()) throw new Error('Transition reason is required');
  }
  return deps.entries.transition(
    ctx,
    id,
    kind,
    from,
    to,
    actor.trim(),
    reason.trim(),
    statusCategory
      ? {
          statusCategory,
          workflowRevisionId: workflowRevisionId!,
          ...(notification ? { notification } : {}),
        }
      : undefined,
  );
}
