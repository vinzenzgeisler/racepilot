import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createEntryConfirmationPdf } from './documents.js';

describe('entry confirmation PDF', () => {
  it('renders deterministically with snapshot date and organization branding only', async () => {
    const input = {
      eventName: 'RacePilot Cup',
      eventStartsOn: '2026-05-01',
      driverName: 'Max Mustermann',
      vehicle: 'Example GT',
      classes: ['GT1'],
      priceSnapshot: {
        version: '1' as const,
        currency: 'EUR',
        calculatedAt: '2026-01-01T12:00:00.000Z',
        totalCents: 12500,
        lines: [],
      },
      paymentRecipient: null,
      paymentReference: 'RP-123',
      bankTransferCapability: false,
      branding: {
        organizationName: 'Example Club',
        primaryColor: '#174ea6',
        contactEmail: 'info@example.test',
        version: 'brand-v1',
      },
    };
    const first = await createEntryConfirmationPdf(input);
    const second = await createEntryConfirmationPdf(input);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const pdf = await PDFDocument.load(first);
    const content = Buffer.from(first).toString('latin1');
    expect(content).not.toContain('MSC');
    expect(pdf.getTitle()).toContain('RacePilot Cup');
    expect(pdf.getAuthor()).toBe('Example Club');
  });
});
