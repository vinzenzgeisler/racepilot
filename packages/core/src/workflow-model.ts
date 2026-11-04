import {
  EntryStatusDimensionConfig,
  EntryStatusHintKey,
} from './status-config.js';
import { EntryStatusDimensionKey } from './status-config.js';
import { MembershipRole } from './providers.js';
import { OrganizationId } from './context.js';
import { RequestContext } from './context.js';

export type EntryVerificationStatus = 'unverified' | 'verified';

export type EntryAcceptanceStatus = string;

export const entryStatusMeanings = [
  'new',
  'in_progress',
  'missing',
  'done',
  'rejected',
  'not_relevant',
] as const;

export type EntryStatusMeaning = (typeof entryStatusMeanings)[number];

export const entryWorkflowCategories = [
  'pending',
  'accepted',
  'rejected',
  'waitlisted',
  'withdrawn',
] as const;

export type EntryWorkflowCategory = (typeof entryWorkflowCategories)[number];

export interface EntryWorkflowStatus {
  readonly key: string;
  readonly labels: { readonly de: string; readonly en: string };
  readonly color: string;
  readonly category: EntryWorkflowCategory;
  /** Fixed NENNBOX semantic; optional only for old persisted workflow revisions. */
  readonly meaning?: EntryStatusMeaning;
}

export interface EntryWorkflowTransition {
  readonly from: string;
  readonly to: string;
  readonly reasonRequired: boolean;
  readonly permission?: string;
  readonly roles?: readonly MembershipRole[];
  readonly notify?: boolean;
}

export interface EntryWorkflow {
  readonly version: number;
  readonly statuses: readonly EntryWorkflowStatus[];
  readonly transitions: readonly EntryWorkflowTransition[];
}

export interface EntryWorkflowRevision {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly eventId: string | null;
  readonly workflow: EntryWorkflow;
  readonly version: number;
}

export interface EntryWorkflowRepository {
  getOrganization(ctx: RequestContext): Promise<EntryWorkflowRevision | null>;
  getEffective(
    ctx: RequestContext,
    eventId: string,
  ): Promise<EntryWorkflowRevision | null>;
  getPinnedForEntry(
    ctx: RequestContext,
    entryId: string,
  ): Promise<EntryWorkflowRevision | null>;
  setOrganization(
    ctx: RequestContext,
    workflow: EntryWorkflow,
    actor: string,
    reason: string,
  ): Promise<EntryWorkflowRevision>;
  setEvent(
    ctx: RequestContext,
    eventId: string,
    workflow: EntryWorkflow,
    actor: string,
    reason: string,
  ): Promise<EntryWorkflowRevision | null>;
}

export interface EntryStatusDimensionRepository {
  getEvent(
    ctx: RequestContext,
    eventId: string,
  ): Promise<EntryStatusDimensionConfig | null>;
  setEvent(
    ctx: RequestContext,
    eventId: string,
    config: EntryStatusDimensionConfig,
    actor: string,
    reason: string,
  ): Promise<EntryStatusDimensionConfig | null>;
  transition(
    ctx: RequestContext,
    entryId: string,
    dimension: 'technical_inspection' | 'waiver',
    to: string,
    actor: string,
    reason: string,
  ): Promise<boolean | null>;
  updateHints(
    ctx: RequestContext,
    entryId: string,
    hints: Partial<Record<EntryStatusHintKey, boolean>>,
    actor: string,
    reason: string,
  ): Promise<boolean>;
}

export class EntryStatusInUseError extends Error {
  readonly dimension: EntryStatusDimensionKey;
  readonly status: string;

  constructor(dimension: EntryStatusDimensionKey, status: string) {
    super(`Cannot remove in-use status ${dimension}.${status}`);
    this.name = 'EntryStatusInUseError';
    this.dimension = dimension;
    this.status = status;
  }
}

export const defaultEntryWorkflow: EntryWorkflow = Object.freeze<EntryWorkflow>(
  {
    version: 1,
    statuses: [
      {
        key: 'pending',
        labels: { de: 'Ausstehend', en: 'Pending' },
        color: '#64748b',
        category: 'pending',
        meaning: 'new',
      },
      {
        key: 'accepted',
        labels: { de: 'Angenommen', en: 'Accepted' },
        color: '#15803d',
        category: 'accepted',
        meaning: 'done',
      },
      {
        key: 'rejected',
        labels: { de: 'Abgelehnt', en: 'Rejected' },
        color: '#b91c1c',
        category: 'rejected',
        meaning: 'rejected',
      },
      {
        key: 'waitlisted',
        labels: { de: 'Warteliste', en: 'Waitlisted' },
        color: '#a16207',
        category: 'waitlisted',
        meaning: 'in_progress',
      },
      {
        key: 'withdrawn',
        labels: { de: 'Zurückgezogen', en: 'Withdrawn' },
        color: '#475569',
        category: 'withdrawn',
        meaning: 'not_relevant',
      },
    ],
    transitions: [
      ...['accepted', 'rejected', 'waitlisted', 'withdrawn'].map((to) => ({
        from: 'pending',
        to,
        reasonRequired: false,
      })),
      ...['accepted', 'rejected'].map((from) => ({
        from,
        to: 'withdrawn',
        reasonRequired: false,
      })),
      { from: 'waitlisted', to: 'accepted', reasonRequired: false },
      { from: 'waitlisted', to: 'rejected', reasonRequired: false },
      { from: 'waitlisted', to: 'withdrawn', reasonRequired: false },
    ],
  },
);

const defaultMeaningByCategory: Readonly<
  Record<EntryWorkflowCategory, EntryStatusMeaning>
> = Object.freeze({
  pending: 'new',
  accepted: 'done',
  rejected: 'rejected',
  waitlisted: 'in_progress',
  withdrawn: 'not_relevant',
});

/** Add stable semantics to legacy revisions while preserving their legacy color field. */
export function normalizeEntryWorkflow(workflow: EntryWorkflow): EntryWorkflow {
  return {
    ...workflow,
    statuses: workflow.statuses.map((status) => {
      const meaning =
        status.meaning ?? defaultMeaningByCategory[status.category];
      return {
        ...status,
        meaning,
      };
    }),
  };
}
