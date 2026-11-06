import { useState } from 'react';
import { ReasonDialog, TextInput } from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { formatMoney } from './entryDetailModel.js';

type Invoice = NonNullable<NonNullable<Entry['adminDetails']>['invoice']>;

/** "25,50" or "25.50" to cents; null when it is not a positive amount. */
export function parseEuroToCents(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 ? cents : null;
}

export function EntryPaymentDialog({
  invoice,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  invoice: Invoice;
  busy: boolean;
  error?: string | undefined;
  onConfirm: (amountCents: number, reason: string) => void;
  onClose: () => void;
}) {
  const openCents = Math.max(0, invoice.totalCents - invoice.paidCents);
  const [amount, setAmount] = useState(() =>
    (openCents / 100).toFixed(2).replace('.', ','),
  );
  const cents = parseEuroToCents(amount);
  return (
    <ReasonDialog
      open
      title="Zahlung erfassen"
      message={`Offen: ${formatMoney(openCents, invoice.currency)} von ${formatMoney(invoice.totalCents, invoice.currency)}. Verwendungszweck ${invoice.paymentReference}.`}
      reasonLabel="Begründung (für das Protokoll erforderlich)"
      confirmLabel="Zahlung erfassen"
      cancelLabel="Abbrechen"
      closeLabel="Dialog schließen"
      busy={busy}
      error={error}
      confirmDisabled={cents === null}
      onConfirm={(reason) => cents !== null && onConfirm(cents, reason)}
      onClose={onClose}
    >
      <TextInput
        label={`Betrag (${invoice.currency})`}
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        {...(amount && cents === null
          ? { error: 'Bitte einen Betrag wie 25,00 angeben.' }
          : {})}
      />
    </ReasonDialog>
  );
}
