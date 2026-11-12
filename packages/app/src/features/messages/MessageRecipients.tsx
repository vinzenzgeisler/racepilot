import {
  Checkbox,
  Field,
  FilterBar,
  FormSection,
  SelectField,
  Textarea,
} from '@racepilot/ui';
import type {
  MessageRecipientFilter,
  MessageRecipientPreview,
} from '@racepilot/contracts';
import { EventClassSchema } from '@racepilot/contracts';
import { z } from 'zod';

type Props = {
  filter: MessageRecipientFilter;
  onChange: (filter: MessageRecipientFilter) => void;
  classes: z.infer<typeof EventClassSchema>[];
  candidates: MessageRecipientPreview;
  selection: MessageRecipientPreview;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  addresses: string;
  onAddresses: (value: string) => void;
};
const statusSchema = z.enum(['pending', 'accepted', 'rejected', 'withdrawn']);
const paymentSchema = z.enum(['any', 'paid', 'open', 'unpaid']);
const statuses = [
  ['pending', 'Offen'],
  ['accepted', 'Angenommen'],
  ['rejected', 'Abgelehnt'],
  ['withdrawn', 'Zurückgezogen'],
];
export function MessageRecipients({
  filter,
  onChange,
  classes,
  candidates,
  selection,
  loading,
  search,
  onSearch,
  addresses,
  onAddresses,
}: Props) {
  const matches = candidates.recipients.filter((candidate) =>
    `${candidate.name} ${candidate.email}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <FormSection
      title="Empfänger"
      description="Filter und einzelne Nennungen können kombiniert werden."
    >
      <FilterBar label="Empfänger filtern">
        <SelectField
          label="Klasse"
          value={filter.classIds[0] ?? ''}
          onChange={(event) =>
            onChange({
              ...filter,
              classIds: event.target.value ? [event.target.value] : [],
            })
          }
        >
          <option value="">Alle Klassen</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Nennungsstatus"
          value={filter.statuses[0] ?? ''}
          onChange={(event) =>
            onChange({
              ...filter,
              statuses: statusSchema.safeParse(event.target.value).success
                ? [statusSchema.parse(event.target.value)]
                : [],
            })
          }
        >
          <option value="">Alle Status</option>
          {statuses.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="E-Mail-Prüfung"
          value={
            filter.emailVerified === undefined
              ? ''
              : String(filter.emailVerified)
          }
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              ...filter,
              ...(value
                ? { emailVerified: value === 'true' }
                : { emailVerified: undefined }),
            });
          }}
        >
          <option value="">Alle</option>
          <option value="true">Bestätigt</option>
          <option value="false">Nicht bestätigt</option>
        </SelectField>
        <SelectField
          label="Zahlung"
          value={filter.payment}
          onChange={(event) =>
            onChange({
              ...filter,
              payment: paymentSchema.parse(event.target.value),
            })
          }
        >
          <option value="any">Alle</option>
          <option value="paid">Bezahlt</option>
          <option value="open">Offen</option>
          <option value="unpaid">Unbezahlt</option>
        </SelectField>
      </FilterBar>
      <Field
        label="Nennung suchen"
        type="search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Name oder E-Mail"
      />
      <div className="nb-message-picks" aria-label="Einzelne Nennungen wählen">
        {matches.map(
          (candidate) =>
            candidate.entryId && (
              <Checkbox
                key={candidate.entryId}
                label={`${candidate.name || candidate.email} · ${candidate.email}`}
                checked={filter.entryIds.includes(candidate.entryId)}
                onChange={(event) =>
                  onChange({
                    ...filter,
                    entryIds: event.target.checked
                      ? [...filter.entryIds, candidate.entryId ?? '']
                      : filter.entryIds.filter(
                          (id) => id !== candidate.entryId,
                        ),
                  })
                }
              />
            ),
        )}
      </div>
      <Textarea
        label="Zusätzliche E-Mail-Adressen"
        hint="Eine Adresse pro Zeile oder durch Komma getrennt"
        value={addresses}
        onChange={(event) => onAddresses(event.target.value)}
      />
      <p role="status">
        {loading
          ? 'Empfänger werden ermittelt…'
          : `${selection.count} Empfänger`}
      </p>
    </FormSection>
  );
}
