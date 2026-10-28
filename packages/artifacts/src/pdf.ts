import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  createTransferInstruction,
  type PaymentRecipient,
  type PriceSnapshot,
} from '@racepilot/core';

export interface EntryConfirmationData {
  readonly eventName: string;
  readonly eventStartsOn: string;
  readonly driverName: string;
  readonly vehicle: string;
  readonly classes: readonly string[];
  readonly priceSnapshot: PriceSnapshot;
  readonly paymentRecipient: PaymentRecipient | null;
  readonly paymentReference: string;
  readonly bankTransferCapability: boolean;
  readonly branding: {
    readonly organizationName: string;
    readonly primaryColor: string;
    readonly contactEmail: string | null;
    readonly version: string;
  };
}

export async function createEntryConfirmationPdf(
  input: EntryConfirmationData,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(new URL('../fonts/DejaVuSans.ttf', import.meta.url)),
    readFile(new URL('../fonts/DejaVuSans-Bold.ttf', import.meta.url)),
  ]);
  const regular = await document.embedFont(regularBytes, { subset: true });
  const bold = await document.embedFont(boldBytes, { subset: true });
  const date = new Date(input.priceSnapshot.calculatedAt);
  if (!Number.isFinite(date.getTime()))
    throw new Error('Invalid price snapshot timestamp');
  document.setTitle('Entry confirmation – ' + input.eventName);
  document.setAuthor(input.branding.organizationName);
  document.setSubject('Entry confirmation');
  document.setCreator('RacePilot');
  document.setProducer('RacePilot');
  document.setCreationDate(date);
  document.setModificationDate(date);
  const page = document.addPage([595.28, 841.89]);
  const rgbColor = (hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex))
      throw new Error('Invalid organization brand color');
    return rgb(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    );
  };
  const color = rgbColor(input.branding.primaryColor);
  const text = (
    value: string,
    x: number,
    y: number,
    size = 12,
    font = regular,
  ) =>
    page.drawText(value, {
      x,
      y,
      size,
      font,
      color: rgb(0.12, 0.15, 0.2),
      maxWidth: 480,
    });
  page.drawRectangle({ x: 0, y: 775, width: 595.28, height: 66.89, color });
  page.drawText(input.branding.organizationName, {
    x: 48,
    y: 800,
    size: 19,
    font: bold,
    color: rgb(1, 1, 1),
  });
  text('Nennbestätigung', 48, 735, 24, bold);
  text('Veranstaltung: ' + input.eventName, 48, 690, 14, bold);
  text('Datum: ' + input.eventStartsOn, 48, 668);
  text('Fahrer: ' + input.driverName, 48, 625);
  text('Fahrzeug: ' + input.vehicle, 48, 603);
  text('Klassen: ' + input.classes.join(', '), 48, 581);
  const amount =
    (input.priceSnapshot.totalCents / 100).toFixed(2) +
    ' ' +
    input.priceSnapshot.currency;
  text('Preis laut Preissnapshot: ' + amount, 48, 535, 14, bold);
  if (input.bankTransferCapability) {
    const instruction = createTransferInstruction({
      recipient: input.paymentRecipient,
      amountCents: input.priceSnapshot.totalCents,
      currency: input.priceSnapshot.currency,
      reference: input.paymentReference,
    });
    if (instruction) {
      text(
        'Zahlungsanweisung: Überweisung mit Referenz ' + input.paymentReference,
        48,
        490,
      );
      if (input.paymentRecipient) {
        text('Empfänger: ' + input.paymentRecipient.accountName, 48, 472);
        text('IBAN: ' + input.paymentRecipient.iban, 48, 454);
      }
      const qr = await QRCode.toBuffer(instruction, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 4,
      });
      const image = await document.embedPng(qr);
      page.drawImage(image, { x: 48, y: 330, width: 132, height: 132 });
      text('GiroCode', 48, 312, 10);
    }
  }
  if (input.branding.contactEmail) text(input.branding.contactEmail, 48, 45, 9);
  text('Branding-Version: ' + input.branding.version, 48, 30, 8);
  return document.save({ useObjectStreams: false, addDefaultPage: false });
}
