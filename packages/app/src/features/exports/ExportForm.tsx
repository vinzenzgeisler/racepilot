import {
  Button,
  Checkbox,
  DetailSection,
  SelectField,
  TextInput,
} from '@racepilot/ui';
import type { ExportDraft } from './exportModel.js';
import {
  ALL_FIELDS,
  DELIMITER_LABELS,
  FIELD_LABELS,
  PAYMENT_OPTIONS,
  VERIFICATION_OPTIONS,
  toggleField,
} from './exportModel.js';
import { EXPORT_DELIMITERS } from '@racepilot/contracts';

type Option = { key: string; label: string };

export function ExportForm({
  draft,
  onChange,
  classes,
  statuses,
  busy,
  onSubmit,
}: {
  draft: ExportDraft;
  onChange: (next: ExportDraft) => void;
  classes: Option[];
  statuses: Option[];
  busy: boolean;
  onSubmit: () => void;
}) {
  const update = (part: Partial<ExportDraft>) =>
    onChange({ ...draft, ...part });
  return (
    <DetailSection title="Nennliste als CSV">
      <div className="export-form">
        <p>
          Wähle dieselben Filter wie in der Nennungsliste. Die Datei enthält
          UTF-8 mit BOM für Excel.
        </p>
        <div className="export-filters">
          <TextInput
            label="Suche"
            type="search"
            value={draft.search}
            maxLength={120}
            onChange={(event) => update({ search: event.target.value })}
          />
          <SelectField
            label="Klasse"
            value={draft.classId}
            onChange={(event) => update({ classId: event.target.value })}
          >
            <option value="">Alle</option>
            {classes.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Nennungsstatus"
            value={draft.acceptanceStatus}
            onChange={(event) =>
              update({ acceptanceStatus: event.target.value })
            }
          >
            <option value="">Alle</option>
            {statuses.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="E-Mail-Prüfung"
            value={draft.verificationStatus}
            onChange={(event) =>
              update({ verificationStatus: event.target.value })
            }
          >
            <option value="">Alle</option>
            {VERIFICATION_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Zahlung"
            value={draft.paymentStatus}
            onChange={(event) => update({ paymentStatus: event.target.value })}
          >
            <option value="">Alle</option>
            {PAYMENT_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Trennzeichen"
            value={draft.delimiter}
            onChange={(event) =>
              update({ delimiter: event.target.value === ',' ? ',' : ';' })
            }
          >
            {EXPORT_DELIMITERS.map((key) => (
              <option key={key} value={key}>
                {DELIMITER_LABELS[key]}
              </option>
            ))}
          </SelectField>
        </div>
        <fieldset className="export-fields">
          <legend>Spalten</legend>
          {ALL_FIELDS.map((field) => (
            <Checkbox
              key={field}
              label={FIELD_LABELS[field]}
              checked={draft.fields.includes(field)}
              onChange={() =>
                update({ fields: toggleField(draft.fields, field) })
              }
            />
          ))}
        </fieldset>
        <Button onClick={onSubmit} disabled={busy || draft.fields.length === 0}>
          {busy ? 'Export wird erstellt …' : 'CSV-Export erstellen'}
        </Button>
      </div>
    </DetailSection>
  );
}
