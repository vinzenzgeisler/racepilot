import type { RequestContext } from './context.js';
import type { ClassPriceRule } from './pricing.js';
import type {
  Event,
  EventRepository,
  EventInput,
  EventClassInput,
} from './events.js';
import { validateEventInput, validateClass } from './events.js';

export interface EventSetupRepository {
  createSetup(ctx: RequestContext, input: EventSetupInput): Promise<Event>;
}

export interface EventSetupInput {
  event: EventInput;
  classes: Array<EventClassInput & { price: ClassPriceRule }>;
  terms: Array<{
    key: string;
    version: string;
    language: 'de' | 'en';
    text: string;
    hash: string;
    required: boolean;
  }>;
  actor: string;
}

export async function createEventSetup(
  ctx: RequestContext,
  input: EventSetupInput,
  deps: { events: EventRepository; setup: EventSetupRepository },
): Promise<Event> {
  if (
    !ctx.permissions.has('event:write') ||
    !ctx.permissions.has('class:write')
  )
    throw new Error('Forbidden');
  validateEventInput(input.event);
  if (input.classes.length === 0)
    throw new Error('At least one class is required');
  for (const [index, item] of input.classes.entries()) {
    validateClass(item);
    if (
      item.price.classId !== `class:${index}` ||
      !Number.isSafeInteger(item.price.baseCents) ||
      item.price.baseCents < 0 ||
      !Number.isSafeInteger(item.price.additionalEntryAdjustmentCents) ||
      !Number.isSafeInteger(item.price.earlyBirdDiscountCents) ||
      item.price.earlyBirdDiscountCents < 0 ||
      (item.price.earlyBirdDeadline !== null &&
        !Number.isFinite(Date.parse(item.price.earlyBirdDeadline)))
    )
      throw new Error('Invalid price rule');
  }
  for (const term of input.terms) {
    if (
      !term.key.trim() ||
      !term.version.trim() ||
      !term.text.trim() ||
      !/^[a-f0-9]{64}$/i.test(term.hash)
    )
      throw new Error('Invalid participation terms');
  }
  return deps.setup.createSetup(ctx, input);
}
