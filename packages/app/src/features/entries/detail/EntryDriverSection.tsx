import { useState } from 'react';
import {
  Button,
  DateInput,
  DetailSection,
  FieldGrid,
  FieldItem,
  FormGrid,
  FormWide,
  SelectField,
  TextInput,
} from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { EntryDriverUpdateRequest } from '@racepilot/contracts';
import {
  COUNTRY_CODES,
  NOT_GIVEN,
  PUBLICATION_LABELS,
  countryName,
  formatBirthDate,
} from './entryDetailModel.js';
import type { Outcome } from './useEntryDetailApi.js';

type Driver = NonNullable<Entry['adminDetails']>['driver'];
const Value = ({ children }: { children: string | null | undefined }) =>
  children ? (
    <>{children}</>
  ) : (
    <span className="nb-field-empty">{NOT_GIVEN}</span>
  );

export function EntryDriverSection({
  driver,
  passenger,
  busy,
  onSave,
}: {
  driver: Driver;
  passenger: boolean;
  busy: boolean;
  onSave: (patch: EntryDriverUpdateRequest) => Promise<Outcome>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [first = '', ...rest] = driver.name.split(' ');
  const start = () => {
    setDraft({
      firstName: first,
      lastName: rest.join(' '),
      dateOfBirth: driver.dateOfBirth ?? '',
      country: driver.country ?? '',
      phone: driver.phone ?? '',
      street: driver.street ?? '',
      postalCode: driver.postalCode ?? '',
      city: driver.city ?? '',
      emergencyContactName: driver.emergencyContactName ?? '',
      emergencyContactPhone: driver.emergencyContactPhone ?? '',
      publicationPreference: driver.publicationPreference ?? '',
    });
    setError('');
    setEditing(true);
  };
  const bind = (key: string) => ({
    value: draft[key] ?? '',
    onChange: (event: { target: { value: string } }) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  });
  async function save() {
    const text = (key: string) => draft[key]?.trim() || null;
    const result = await onSave({
      firstName: draft.firstName?.trim() ?? '',
      lastName: draft.lastName?.trim() ?? '',
      dateOfBirth: text('dateOfBirth'),
      country: text('country'),
      phone: text('phone'),
      street: text('street'),
      postalCode: text('postalCode'),
      city: text('city'),
      emergencyContactName: text('emergencyContactName'),
      emergencyContactPhone: text('emergencyContactPhone'),
      publicationPreference:
        (text('publicationPreference') as Driver['publicationPreference']) ??
        null,
    });
    if (result.ok) setEditing(false);
    else setError(result.message);
  }
  const countries = [...COUNTRY_CODES] as string[];
  if (draft.country && !countries.includes(draft.country))
    countries.push(draft.country);
  return (
    <DetailSection
      title="Fahrer"
      action={
        !editing ? (
          <Button variant="text" size={32} onClick={start}>
            Bearbeiten
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <FormGrid>
            <TextInput label="Vorname" required {...bind('firstName')} />
            <TextInput label="Nachname" required {...bind('lastName')} />
            <DateInput label="Geburtsdatum" {...bind('dateOfBirth')} />
            <SelectField label="Land" {...bind('country')}>
              <option value="">{NOT_GIVEN}</option>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {countryName(code)}
                </option>
              ))}
            </SelectField>
            <TextInput label="Telefon" type="tel" {...bind('phone')} />
            <TextInput label="Straße und Nr." {...bind('street')} />
            <TextInput label="PLZ" {...bind('postalCode')} />
            <TextInput label="Ort" {...bind('city')} />
            <TextInput
              label="Notfallkontakt · Name"
              {...bind('emergencyContactName')}
            />
            <TextInput
              label="Notfallkontakt · Telefon"
              type="tel"
              {...bind('emergencyContactPhone')}
            />
            <SelectField
              label="Veröffentlichung"
              {...bind('publicationPreference')}
            >
              <option value="">{NOT_GIVEN}</option>
              {Object.entries(PUBLICATION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
            <FormWide>
              <p className="nb-field-empty">
                Die E-Mail-Adresse ist bestätigt und wird hier nicht geändert.
              </p>
            </FormWide>
          </FormGrid>
          {error && <p role="alert">{error}</p>}
          <div className="nb-form-actions">
            <Button
              type="submit"
              size={40}
              disabled={
                busy || !draft.firstName?.trim() || !draft.lastName?.trim()
              }
            >
              Speichern
            </Button>
            <Button
              variant="secondary"
              size={40}
              onClick={() => setEditing(false)}
            >
              Abbrechen
            </Button>
          </div>
        </form>
      ) : (
        <FieldGrid>
          <FieldItem label="Name">
            <Value>{driver.name}</Value>
          </FieldItem>
          <FieldItem label="Geburtsdatum">
            <Value>{formatBirthDate(driver.dateOfBirth)}</Value>
          </FieldItem>
          <FieldItem label="Land">
            <Value>{countryName(driver.country)}</Value>
          </FieldItem>
          <FieldItem label="E-Mail">
            <Value>{driver.email}</Value>
          </FieldItem>
          <FieldItem label="Telefon">
            <Value>{driver.phone}</Value>
          </FieldItem>
          <FieldItem label="Anschrift">
            <Value>
              {[
                driver.street,
                [driver.postalCode, driver.city].filter(Boolean).join(' '),
              ]
                .filter(Boolean)
                .join(', ')}
            </Value>
          </FieldItem>
          <FieldItem label="Notfallkontakt">
            <Value>
              {[driver.emergencyContactName, driver.emergencyContactPhone]
                .filter(Boolean)
                .join(' · ')}
            </Value>
          </FieldItem>
          <FieldItem label="Beifahrer">
            <Value>{passenger ? 'gemeldet' : null}</Value>
          </FieldItem>
          <FieldItem label="Veröffentlichung">
            <Value>
              {driver.publicationPreference
                ? PUBLICATION_LABELS[driver.publicationPreference]
                : null}
            </Value>
          </FieldItem>
        </FieldGrid>
      )}
    </DetailSection>
  );
}
