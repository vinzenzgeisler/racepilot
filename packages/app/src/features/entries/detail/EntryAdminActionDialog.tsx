import { useState } from 'react';
import {
  Button,
  Dialog,
  ReasonDialog,
  SelectField,
  TextInput,
  Textarea,
} from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { formatMoney } from './entryDetailModel.js';
import type { EntryAdminAction } from './useEntryDetailApi.js';

export type AdminActionKind =
  'change_class' | 'adjust_amount' | 'note' | 'delete';

export function EntryAdminActionDialog({
  kind,
  entry,
  classes,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  kind: AdminActionKind;
  entry: Entry;
  classes: Array<{ id: string; name: string; closed?: boolean }>;
  busy: boolean;
  error: string;
  onConfirm: (action: EntryAdminAction) => void;
  onClose: () => void;
}) {
  const details = entry.adminDetails;
  const [classId, setClassId] = useState('');
  const [amount, setAmount] = useState(() =>
    (
      (entry.priceSnapshot?.totalCents ?? details?.invoice?.totalCents ?? 0) /
      100
    )
      .toFixed(2)
      .replace('.', ','),
  );
  const [visibility, setVisibility] = useState<'internal' | 'driver'>(
    'internal',
  );
  const [text, setText] = useState('');
  const version = entry.revision;
  const cents = parseAmount(amount);

  if (kind === 'note')
    return (
      <Dialog
        open
        title="Notiz hinzufügen"
        closeLabel="Dialog schließen"
        onClose={onClose}
        actions={
          <>
            <Button variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              disabled={busy || !text.trim()}
              onClick={() =>
                onConfirm({ kind: 'note', visibility, text: text.trim() })
              }
            >
              Notiz speichern
            </Button>
          </>
        }
      >
        <div className="nb-reason-body">
          <SelectField
            label="Sichtbarkeit"
            value={visibility}
            onChange={(event) =>
              setVisibility(event.target.value as 'internal' | 'driver')
            }
          >
            <option value="internal">Nur intern</option>
            <option value="driver">Für Fahrer sichtbar</option>
          </SelectField>
          <Textarea
            label="Notiz"
            value={text}
            maxLength={4000}
            required
            onChange={(event) => setText(event.target.value)}
          />
          {error && (
            <p role="alert" className="nb-reason-error">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    );

  const isDelete = kind === 'delete';
  const isClass = kind === 'change_class';
  const title = isDelete
    ? 'Nennung löschen'
    : isClass
      ? 'Klasse ändern'
      : 'Betrag anpassen';
  const confirmLabel = isDelete
    ? 'Nennung löschen'
    : isClass
      ? 'Klasse ändern'
      : 'Betrag anpassen';
  const eligibleClassIds = new Set(
    (entry.availableActions ?? [])
      .filter((action) => action.startsWith('change_class:'))
      .map((action) => action.slice('change_class:'.length)),
  );
  const targetClasses = classes.filter(
    (item) =>
      item.id !== entry.classId &&
      !item.closed &&
      (!eligibleClassIds.size || eligibleClassIds.has(item.id)),
  );
  const invalidVersion = version === undefined;
  return (
    <ReasonDialog
      open
      title={title}
      message={
        isDelete
          ? 'Die Nennung wird aus Liste und Zählern entfernt. Sie bleibt für Audit und Aufbewahrung erhalten.'
          : isClass
            ? `Aktuelle Klasse: ${details?.eventClass.name ?? 'Unbekannt'}. Der Preis wird neu berechnet; erfasste Zahlungen bleiben bestehen.`
            : `Aktueller geschuldeter Betrag: ${formatMoney(entry.priceSnapshot?.totalCents ?? 0, entry.priceSnapshot?.currency ?? 'EUR')}.`
      }
      reasonLabel="Begründung (für das Protokoll erforderlich)"
      confirmLabel={confirmLabel}
      cancelLabel="Abbrechen"
      closeLabel="Dialog schließen"
      busy={busy}
      error={
        error ||
        (invalidVersion
          ? 'Die Versionsnummer der Nennung fehlt. Bitte Detailansicht neu laden.'
          : '')
      }
      confirmDisabled={
        invalidVersion || (isClass ? !classId : !isDelete && cents === null)
      }
      onClose={onClose}
      onConfirm={(reason) => {
        if (version === undefined) return;
        if (isDelete)
          onConfirm({ kind: 'delete', reason, expectedVersion: version });
        else if (isClass && classId)
          onConfirm({
            kind: 'change_class',
            classId,
            reason,
            expectedVersion: version,
          });
        else if (!isClass && cents !== null)
          onConfirm({
            kind: 'adjust_amount',
            amountCents: cents,
            reason,
            expectedVersion: version,
          });
      }}
    >
      {isClass ? (
        <SelectField
          label="Neue Klasse"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
        >
          <option value="">Klasse wählen</option>
          {targetClasses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
      ) : !isDelete ? (
        <TextInput
          label={`Neuer Betrag (${entry.priceSnapshot?.currency ?? details?.invoice?.currency ?? 'EUR'})`}
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          {...(amount && cents === null
            ? { error: 'Bitte einen Betrag wie 25,00 angeben.' }
            : {})}
        />
      ) : null}
    </ReasonDialog>
  );
}

function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
