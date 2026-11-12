import { RequestContext } from './context.js';

export interface ClassPriceRule {
  readonly classId: string;
  readonly baseCents: number;
  /** Signed adjustment applied to every entry after the first in this group. */
  readonly additionalEntryAdjustmentCents: number;
  readonly earlyBirdDeadline: string | null;
  readonly earlyBirdDiscountCents: number;
}

export interface PriceLineInput {
  readonly classId: string;
  readonly quantity: number;
  readonly rule: ClassPriceRule;
}

export interface PriceSnapshotLine {
  readonly classId: string;
  readonly quantity: number;
  readonly baseCents: number;
  readonly additionalEntryAdjustmentCents: number;
  readonly earlyBirdDiscountCents: number;
  readonly totalCents: number;
}

export interface PriceSnapshot {
  readonly version: '1';
  readonly currency: string;
  readonly calculatedAt: string;
  readonly totalCents: number;
  readonly lines: readonly PriceSnapshotLine[];
}

export function calculatePrice(input: {
  currency: string;
  lines: readonly PriceLineInput[];
  submittedAt: string;
}): PriceSnapshot {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Invalid currency');
  const submitted = Date.parse(input.submittedAt);
  if (!Number.isFinite(submitted)) throw new Error('Invalid submission time');
  const classIds = new Set<string>();
  const lines = input.lines.map(({ classId, quantity, rule }) => {
    if (classIds.has(classId) || classId !== rule.classId)
      throw new Error('Invalid or duplicate class price rule');
    classIds.add(classId);
    for (const amount of [
      rule.baseCents,
      rule.additionalEntryAdjustmentCents,
      rule.earlyBirdDiscountCents,
    ])
      if (!Number.isSafeInteger(amount))
        throw new Error('Price amounts must be integer cents');
    if (
      rule.baseCents < 0 ||
      rule.earlyBirdDiscountCents < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1
    )
      throw new Error('Invalid quantity or price');
    if (
      rule.earlyBirdDeadline !== null &&
      !Number.isFinite(Date.parse(rule.earlyBirdDeadline))
    )
      throw new Error('Invalid early-bird deadline');
    const early =
      rule.earlyBirdDeadline !== null &&
      submitted <= Date.parse(rule.earlyBirdDeadline)
        ? rule.earlyBirdDiscountCents
        : 0;
    const gross =
      rule.baseCents * quantity +
      rule.additionalEntryAdjustmentCents * (quantity - 1) -
      early * quantity;
    const totalCents = Math.max(0, gross);
    if (!Number.isSafeInteger(totalCents))
      throw new Error('Price total exceeds safe integer range');
    return Object.freeze({
      classId,
      quantity,
      baseCents: rule.baseCents,
      additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
      earlyBirdDiscountCents: early,
      totalCents,
    });
  });
  return Object.freeze({
    version: '1',
    currency: input.currency,
    calculatedAt: new Date(submitted).toISOString(),
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    lines: Object.freeze(lines),
  });
}

export function createPaymentReference(seed: string): string {
  const compact = seed
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(-20);
  if (!compact) throw new Error('Reference seed is required');
  const rearranged = `${compact}RF00`;
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  const check = String(98 - remainder).padStart(2, '0');
  return `RF${check}${compact}`;
}

export function isValidPaymentReference(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(compact)) return false;
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function validateIban(value: string): boolean {
  const iban = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  let remainder = 0;
  for (const char of `${iban.slice(4)}${iban.slice(0, 4)}`) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export interface PaymentRecipient {
  readonly accountName: string;
  readonly iban: string;
  readonly bic?: string | null;
}

export function validatePaymentRecipient(
  input: PaymentRecipient,
): PaymentRecipient {
  if (
    !input.accountName.trim() ||
    input.accountName.length > 70 ||
    !validateIban(input.iban) ||
    (input.bic != null &&
      !/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/.test(input.bic.toUpperCase()))
  )
    throw new Error('Invalid bank recipient');
  return Object.freeze({
    accountName: input.accountName.trim(),
    iban: input.iban.replace(/\s+/g, '').toUpperCase(),
    bic: input.bic?.toUpperCase() ?? null,
  });
}

export function createTransferInstruction(input: {
  recipient: PaymentRecipient | null;
  amountCents: number;
  currency: string;
  reference: string;
  remittanceText?: string;
}): string | null {
  if (!input.recipient) return null;
  const recipient = validatePaymentRecipient(input.recipient);
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 0 ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    !isValidPaymentReference(input.reference)
  )
    throw new Error('Invalid transfer instruction');
  const lines = [
    'BCD',
    '001',
    '1',
    'SCT',
    recipient.bic ?? '',
    recipient.accountName,
    recipient.iban,
    `${input.currency}${(input.amountCents / 100).toFixed(2)}`,
    '',
    input.reference,
    (input.remittanceText ?? '').slice(0, 140),
  ];
  // EPC069-12 payload fields are newline separated. Keep amount currency independent of locale.
  return lines.join('\n');
}

export type MergeClassPriceRuleResult =
  | { ok: true; rule: ClassPriceRule }
  | { ok: false; reason: 'class-id-required' | 'price-fields-required' };

export function mergeClassPriceRule(
  classId: string,
  current: ClassPriceRule | null,
  patch: {
    baseCents?: number | undefined;
    additionalEntryAdjustmentCents?: number | undefined;
    earlyBirdDeadline?: string | null | undefined;
    earlyBirdDiscountCents?: number | undefined;
  },
): MergeClassPriceRuleResult {
  const baseCents = patch.baseCents ?? current?.baseCents;
  const additionalEntryAdjustmentCents =
    patch.additionalEntryAdjustmentCents ??
    current?.additionalEntryAdjustmentCents;
  const earlyBirdDeadline =
    patch.earlyBirdDeadline !== undefined
      ? patch.earlyBirdDeadline
      : current?.earlyBirdDeadline;
  const earlyBirdDiscountCents =
    patch.earlyBirdDiscountCents ?? current?.earlyBirdDiscountCents;
  if (
    !classId.trim() ||
    baseCents === undefined ||
    additionalEntryAdjustmentCents === undefined ||
    earlyBirdDeadline === undefined ||
    earlyBirdDiscountCents === undefined
  )
    return {
      ok: false,
      reason: classId.trim() ? 'price-fields-required' : 'class-id-required',
    };
  return {
    ok: true,
    rule: {
      classId,
      baseCents,
      additionalEntryAdjustmentCents,
      earlyBirdDeadline,
      earlyBirdDiscountCents,
    },
  };
}

export interface EventClassPricingRepository {
  listByEvent(ctx: RequestContext, eventId: string): Promise<ClassPriceRule[]>;
  upsert(
    ctx: RequestContext,
    eventId: string,
    rule: ClassPriceRule,
  ): Promise<ClassPriceRule>;
}
