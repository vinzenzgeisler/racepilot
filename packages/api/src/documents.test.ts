import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { createEntryConfirmationPdf } from '@racepilot/artifacts/pdf';

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
      paymentRecipient: {
        accountName: 'Example Club e.V.',
        iban: 'DE89370400440532013000',
      },
      paymentReference: 'RF18539007547034',
      bankTransferCapability: true,
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
    const content = decodedPdfContent(first);
    expect(content).not.toContain('MSC');
    expect(content).toContain('/Image-');
    expect(content).toContain('/FontFile2');
    expect(pdf.getTitle()).toContain('RacePilot Cup');
    expect(pdf.getAuthor()).toBe('Example Club');
  });

  it('embeds Unicode fonts for German organization, driver, event, and payment names', async () => {
    const input = {
      eventName: 'München – Frühjahrslauf',
      eventStartsOn: '2026-05-01',
      driverName: 'Jürgen Weiß',
      vehicle: 'Škoda – Größe',
      classes: ['Tourenwagen Ä'],
      priceSnapshot: {
        version: '1' as const,
        currency: 'EUR',
        calculatedAt: '2026-01-01T12:00:00.000Z',
        totalCents: 12500,
        lines: [],
      },
      paymentRecipient: null,
      paymentReference: 'RP-1',
      bankTransferCapability: false,
      branding: {
        organizationName: 'Rennclub Köln e.V.',
        primaryColor: '#174ea6',
        contactEmail: null,
        version: 'brand-v1',
      },
    };
    const bytes = await createEntryConfirmationPdf(input);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toContain('München');
    expect(pdf.getAuthor()).toBe('Rennclub Köln e.V.');
    expect(decodedPdfContent(bytes)).toContain('/Subtype /Type0');
  });
  it('does not emit transfer instructions or a QR when the capability is inactive', async () => {
    const input = {
      eventName: 'RacePilot Cup',
      eventStartsOn: '2026-05-01',
      driverName: 'Ada Driver',
      vehicle: 'Roadster',
      classes: ['GT1'],
      priceSnapshot: {
        version: '1' as const,
        currency: 'EUR',
        calculatedAt: '2026-01-01T12:00:00.000Z',
        totalCents: 1000,
        lines: [],
      },
      paymentRecipient: {
        accountName: 'Example Club',
        iban: 'DE89370400440532013000',
      },
      paymentReference: 'RF18539007547034',
      bankTransferCapability: false,
      branding: {
        organizationName: 'Example Club',
        primaryColor: '#174ea6',
        contactEmail: null,
        version: 'brand-v1',
      },
    };
    const bytes = await createEntryConfirmationPdf(input);
    const content = decodedPdfContent(bytes);
    expect(content).not.toContain('GiroCode');
    expect(content).not.toContain('/Image-');
    expect(content).not.toContain('Zahlungsanweisung');
  });
});

function decodedPdfContent(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const decoded = [raw];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      decoded.push(
        inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1'),
      );
    } catch {
      /* image streams are not text */
    }
  }
  const streams = decoded.join('\n');
  const text = [...streams.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)]
    .map((match) => Buffer.from(match[1]!, 'hex').toString('latin1'))
    .join('\n');
  return streams + '\n' + text;
}
