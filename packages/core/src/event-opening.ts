import type { RequestContext } from './context.js';
import type { ClassPriceRule, EventClassPricingRepository } from './pricing.js';
import { transitionEvent } from './events.js';
import type {
  Event,
  EventClass,
  EventClassRepository,
  EventRepository,
} from './events.js';

export type EventOpenReadinessIssue =
  'class-required' | 'price-required' | 'participation-terms-required';

export function evaluateEventOpenReadiness(input: {
  classes: readonly Pick<EventClass, 'id' | 'closed'>[];
  prices: readonly Pick<ClassPriceRule, 'classId'>[];
  terms: readonly { key: string; text: string }[];
}): { ready: boolean; issues: EventOpenReadinessIssue[] } {
  const openClasses = input.classes.filter((item) => !item.closed);
  const issues: EventOpenReadinessIssue[] = [];
  if (openClasses.length === 0) issues.push('class-required');
  if (
    !openClasses.some((item) =>
      input.prices.some((price) => price.classId === item.id),
    )
  )
    issues.push('price-required');
  if (
    !input.terms.some(
      (term) => term.key === 'participation' && term.text.trim(),
    )
  )
    issues.push('participation-terms-required');
  return { ready: issues.length === 0, issues };
}

export type EventConsentTerm = {
  key: string;
  version: string;
  language: 'de' | 'en';
  text: string;
  hash: string;
};

export type EventOpenResult =
  | { status: 'opened'; event: Event }
  | { status: 'not-found' }
  | { status: 'forbidden' }
  | { status: 'not-ready'; issues: EventOpenReadinessIssue[] };

export async function openEvent(
  ctx: RequestContext,
  eventId: string,
  deps: {
    events: EventRepository;
    classes: EventClassRepository;
    pricing: EventClassPricingRepository;
    consents: {
      get(
        context: RequestContext,
        id: string,
      ): Promise<EventConsentTerm[] | null>;
    };
  },
): Promise<EventOpenResult> {
  if (!ctx.permissions.has('event:write')) return { status: 'forbidden' };
  if (!(await deps.events.getById(ctx, eventId)))
    return { status: 'not-found' };
  const [classes, prices, terms] = await Promise.all([
    deps.classes.listByEvent(ctx, eventId),
    deps.pricing.listByEvent(ctx, eventId),
    deps.consents.get(ctx, eventId),
  ]);
  const readiness = evaluateEventOpenReadiness({
    classes,
    prices,
    terms: terms ?? [],
  });
  if (!readiness.ready)
    return { status: 'not-ready', issues: readiness.issues };
  const event = await transitionEvent(ctx, eventId, 'open', new Date(), {
    events: deps.events,
  });
  return event ? { status: 'opened', event } : { status: 'not-found' };
}
