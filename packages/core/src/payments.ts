import { ClassPriceRule } from './pricing.js';
import { EventClassPricingRepository } from './pricing.js';
import { OrganizationId } from './context.js';
import { PaymentRecipient } from './pricing.js';
import { PriceSnapshot } from './pricing.js';
import { RequestContext } from './context.js';
import { validatePaymentRecipient } from './pricing.js';

export async function setClassPriceRule(
  ctx: RequestContext,
  eventId: string,
  rule: ClassPriceRule,
  deps: { pricing: EventClassPricingRepository },
): Promise<ClassPriceRule> {
  if (!ctx.permissions.has('event:write')) throw new Error('Forbidden');
  if (
    !rule.classId.trim() ||
    !Number.isSafeInteger(rule.baseCents) ||
    rule.baseCents < 0 ||
    !Number.isSafeInteger(rule.additionalEntryAdjustmentCents) ||
    !Number.isSafeInteger(rule.earlyBirdDiscountCents) ||
    rule.earlyBirdDiscountCents < 0 ||
    (rule.earlyBirdDeadline !== null &&
      !Number.isFinite(Date.parse(rule.earlyBirdDeadline)))
  )
    throw new Error('Invalid price rule');
  return deps.pricing.upsert(ctx, eventId, rule);
}

export interface InvoiceRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly eventId: string;
  readonly registrationGroupId: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentReference: string;
  readonly status: InvoiceStatus;
}

export interface InvoiceRepository {
  issue(
    ctx: RequestContext,
    eventId: string,
    registrationGroupId: string,
    snapshot: PriceSnapshot,
    executor?: unknown,
  ): Promise<InvoiceRecord>;
}

export async function issueInvoice(
  ctx: RequestContext,
  eventId: string,
  registrationGroupId: string,
  snapshot: PriceSnapshot,
  deps: { invoices: InvoiceRepository },
  executor?: unknown,
): Promise<InvoiceRecord> {
  if (
    snapshot.version !== '1' ||
    !Number.isSafeInteger(snapshot.totalCents) ||
    snapshot.totalCents < 0
  )
    throw new Error('Invalid price snapshot');
  return deps.invoices.issue(
    ctx,
    eventId,
    registrationGroupId,
    snapshot,
    executor,
  );
}

export interface PaymentRecipientRepository {
  get(ctx: RequestContext): Promise<PaymentRecipient | null>;
  set(
    ctx: RequestContext,
    recipient: PaymentRecipient,
  ): Promise<PaymentRecipient>;
}

export async function updatePaymentRecipient(
  ctx: RequestContext,
  recipient: PaymentRecipient,
  deps: { recipients: PaymentRecipientRepository },
): Promise<PaymentRecipient> {
  if (!ctx.permissions.has('organization:update')) throw new Error('Forbidden');
  return deps.recipients.set(ctx, validatePaymentRecipient(recipient));
}

export type InvoiceStatus = 'open' | 'partially_paid' | 'paid' | 'cancelled';

export function deriveInvoiceStatus(
  totalCents: number,
  receivedCents: number,
  cancelled = false,
): InvoiceStatus {
  if (cancelled) return 'cancelled';
  if (receivedCents <= 0) return 'open';
  return receivedCents >= totalCents ? 'paid' : 'partially_paid';
}

export interface InvoicePaymentRepository {
  record(
    ctx: RequestContext,
    invoiceId: string,
    amountCents: number,
    actor: string,
    reason: string,
  ): Promise<unknown | null>;
  correct(
    ctx: RequestContext,
    paymentId: string,
    actor: string,
    reason: string,
  ): Promise<unknown | null>;
}

export async function recordInvoicePayment(
  ctx: RequestContext,
  invoiceId: string,
  amountCents: number,
  actor: string,
  reason: string,
  deps: { payments: InvoicePaymentRepository },
): Promise<unknown | null> {
  if (!ctx.permissions.has('payment:write')) throw new Error('Forbidden');
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !actor.trim() ||
    !reason.trim()
  )
    throw new Error('Invalid payment');
  return deps.payments.record(
    ctx,
    invoiceId,
    amountCents,
    actor.trim(),
    reason.trim(),
  );
}

export async function correctInvoicePayment(
  ctx: RequestContext,
  paymentId: string,
  actor: string,
  reason: string,
  deps: { payments: InvoicePaymentRepository },
): Promise<unknown | null> {
  if (!ctx.permissions.has('payment:write')) throw new Error('Forbidden');
  if (!actor.trim() || !reason.trim())
    throw new Error('Correction actor and reason are required');
  return deps.payments.correct(ctx, paymentId, actor.trim(), reason.trim());
}
