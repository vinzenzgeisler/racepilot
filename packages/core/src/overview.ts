import type { RequestContext } from './context.js';

export interface OverviewWarning {
  readonly type: 'unverified-email';
  readonly count: number;
  readonly filter: { readonly verificationStatus: 'unverified'; readonly eventId: string };
}

export interface EventOverview {
  readonly eventId: string;
  readonly statuses: Readonly<Record<string, number>>;
  readonly openPayments: { readonly count: number; readonly amountCents: number; readonly currency: string };
  readonly classes: readonly { readonly classId: string; readonly name: string; readonly occupied: number; readonly capacity: number | null }[];
  readonly daysUntilRegistrationCloses: number | null;
  readonly warnings: readonly OverviewWarning[];
  readonly missingDocuments?: { readonly count: number };
}

export interface OverviewRepository {
  getEventOverview(ctx: RequestContext, eventId: string, now: Date): Promise<EventOverview | null>;
}

export type OverviewResult = { readonly ok: true; readonly overview: EventOverview } | { readonly ok: false; readonly error: 'event-not-found' };

export async function getEventOverview(
  ctx: RequestContext,
  repository: OverviewRepository,
  eventId: string,
  now: Date = new Date(),
): Promise<OverviewResult> {
  const overview = await repository.getEventOverview(ctx, eventId, now);
  if (!overview) return { ok: false, error: 'event-not-found' };
  return { ok: true, overview };
}
