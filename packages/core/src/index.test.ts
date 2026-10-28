import { describe, expect, it } from 'vitest';
import { organizationId, parseDeploymentMode } from './index.js';

describe('organizationId', () => {
  it('accepts a non-empty identifier', () =>
    expect(organizationId('org-1')).toBe('org-1'));
  it('rejects an empty identifier', () =>
    expect(() => organizationId(' ')).toThrow());
});

describe('parseDeploymentMode', () => {
  it.each(['community', 'cloud'])('accepts %s', (mode) =>
    expect(parseDeploymentMode(mode)).toBe(mode),
  );
  it.each(['', 'Community', 'saas'])('rejects %j', (mode) =>
    expect(() => parseDeploymentMode(mode)).toThrow(),
  );
});

describe('pricing and transfer core', () => {
  it('applies the early-bird deadline inclusively across explicit offsets and prices multiple classes', async () => {
    const { calculatePrice } = await import('./index.js');
    const result = calculatePrice({
      currency: 'EUR',
      submittedAt: '2026-05-01T12:00:00+02:00',
      lines: [
        {
          classId: 'a',
          quantity: 2,
          rule: {
            classId: 'a',
            baseCents: 1000,
            additionalEntryAdjustmentCents: -200,
            earlyBirdDeadline: '2026-05-01T10:00:00Z',
            earlyBirdDiscountCents: 100,
          },
        },
        {
          classId: 'b',
          quantity: 1,
          rule: {
            classId: 'b',
            baseCents: 500,
            additionalEntryAdjustmentCents: 0,
            earlyBirdDeadline: null,
            earlyBirdDiscountCents: 0,
          },
        },
      ],
    });
    expect(result.totalCents).toBe(2100);
    expect(result.lines[0]?.earlyBirdDiscountCents).toBe(100);
  });
  it('clamps deep discounts at zero and snapshots are detached from later rule mutation', async () => {
    const { calculatePrice } = await import('./index.js');
    const rule = {
      classId: 'a',
      baseCents: 100,
      additionalEntryAdjustmentCents: -1000,
      earlyBirdDeadline: null,
      earlyBirdDiscountCents: 0,
    };
    const snapshot = calculatePrice({
      currency: 'EUR',
      submittedAt: '2026-01-01T00:00:00Z',
      lines: [{ classId: 'a', quantity: 3, rule }],
    });
    rule.baseCents = 900;
    expect(snapshot.totalCents).toBe(0);
    expect(snapshot.lines[0]?.baseCents).toBe(100);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
  it('validates RF references, IBAN recipient and fails closed for transfers without recipient', async () => {
    const {
      createPaymentReference,
      isValidPaymentReference,
      validateIban,
      createTransferInstruction,
    } = await import('./index.js');
    const ref = createPaymentReference('group-123');
    expect(isValidPaymentReference(ref)).toBe(true);
    expect(isValidPaymentReference(`${ref.slice(0, 2)}00${ref.slice(4)}`)).toBe(
      false,
    );
    expect(validateIban('DE89370400440532013000')).toBe(true);
    expect(validateIban('DE89370400440532013001')).toBe(false);
    expect(
      createTransferInstruction({
        recipient: null,
        amountCents: 100,
        currency: 'EUR',
        reference: ref,
      }),
    ).toBeNull();
    const payload = createTransferInstruction({
      recipient: { accountName: 'Club', iban: 'DE89370400440532013000' },
      amountCents: 1234,
      currency: 'EUR',
      reference: ref,
    })!;
    expect(payload.split('\n')).toEqual([
      'BCD',
      '001',
      '1',
      'SCT',
      '',
      'Club',
      'DE89370400440532013000',
      'EUR12.34',
      '',
      ref,
      '',
    ]);
  });
  it('derives invoice status from ledger totals', async () => {
    const { deriveInvoiceStatus } = await import('./index.js');
    expect(deriveInvoiceStatus(1000, 0)).toBe('open');
    expect(deriveInvoiceStatus(1000, 400)).toBe('partially_paid');
    expect(deriveInvoiceStatus(1000, 1000)).toBe('paid');
    expect(deriveInvoiceStatus(1000, 0, true)).toBe('cancelled');
  });
});

describe('entry CSV export', () => {
  it('escapes formula and control-character prefixes and quotes cells', async () => {
    const { csvSafeCell, renderEntryCsv } = await import('./index.js');
    expect(
      [
        '=1',
        '+1',
        '-1',
        '@SUM(A1)',
        '\t=1',
        '\r=1',
        '  =1',
        '\n=1',
        '\r\n  +1',
        '\u00a0@SUM(A1)',
      ].map(csvSafeCell),
    ).toEqual([
      '"\'=1"',
      '"\'+1"',
      '"\'-1"',
      '"\'@SUM(A1)"',
      '"\'\t=1"',
      '"\'\r=1"',
      '"\'  =1"',
      '"\'\n=1"',
      '"\'\r\n  +1"',
      '"\'\u00a0@SUM(A1)"',
    ]);
    expect(renderEntryCsv([['a"b', 'x,y']])).toBe('"a""b","x,y"\r\n');
  });
});
