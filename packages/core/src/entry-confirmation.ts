import type { RequestContext } from './context.js';
import type { PriceSnapshot } from './pricing.js';

export interface EntryConfirmationData {
  readonly eventId: string;
  readonly eventName: string;
  readonly eventStartsOn: string;
  readonly registrationGroupId: string;
  readonly driverName: string;
  readonly vehicles: readonly string[];
  readonly classes: readonly string[];
  readonly priceSnapshot: PriceSnapshot;
  readonly paymentReference: string;
  readonly orgaCodes: readonly string[];
}

export interface EntryConfirmationRepository {
  getByGroup(
    ctx: RequestContext,
    eventId: string,
    registrationGroupId: string,
  ): Promise<EntryConfirmationData | null>;
}
