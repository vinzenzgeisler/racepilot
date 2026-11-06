import { useState } from 'react';
import {
  Button,
  DetailSection,
  FieldGrid,
  FieldItem,
  FormGrid,
  FormWide,
  TextInput,
  Textarea,
} from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { EntryVehicleUpdateRequest } from '@racepilot/contracts';
import { NOT_GIVEN } from './entryDetailModel.js';
import type { Outcome } from './useEntryDetailApi.js';

type Vehicle = NonNullable<Entry['adminDetails']>['vehicle'];
const Value = ({
  children,
}: {
  children: string | number | null | undefined;
}) =>
  children !== null && children !== undefined && children !== '' ? (
    <>{children}</>
  ) : (
    <span className="nb-field-empty">{NOT_GIVEN}</span>
  );

export function EntryVehicleSection({
  vehicle,
  busy,
  onSave,
}: {
  vehicle: Vehicle;
  busy: boolean;
  onSave: (patch: EntryVehicleUpdateRequest) => Promise<Outcome>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const start = () => {
    setDraft({
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year?.toString() ?? '',
      registration: vehicle.registration ?? '',
      vehicleType: vehicle.vehicleType ?? '',
      displacementCc: vehicle.displacementCc?.toString() ?? '',
      cylinders: vehicle.cylinders?.toString() ?? '',
      ownerName: vehicle.ownerName ?? '',
      history: vehicle.history ?? '',
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
    const number = (key: string) => {
      const value = text(key);
      return value === null ? null : Number(value);
    };
    const result = await onSave({
      make: draft.make?.trim() ?? '',
      model: draft.model?.trim() ?? '',
      year: number('year'),
      registration: text('registration'),
      vehicleType: text('vehicleType'),
      displacementCc: number('displacementCc'),
      cylinders: number('cylinders'),
      ownerName: text('ownerName'),
      history: text('history'),
    });
    if (result.ok) setEditing(false);
    else setError(result.message);
  }
  return (
    <DetailSection
      title="Fahrzeug"
      action={
        !editing ? (
          <Button variant="text" size={32} onClick={start}>
            Bearbeiten
          </Button>
        ) : undefined
      }
    >
      <div className="nb-vehicle">
        {vehicle.imageUrl ? (
          <figure>
            <img src={vehicle.imageUrl} alt="Fahrzeugbild" />
            <figcaption>Fahrzeugbild · Upload des Teilnehmers</figcaption>
          </figure>
        ) : (
          <figure>
            <div
              className="nb-vehicle-empty"
              role="img"
              aria-label="Kein Fahrzeugbild"
            >
              —
            </div>
            <figcaption>Kein Fahrzeugbild hochgeladen</figcaption>
          </figure>
        )}
        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <FormGrid>
              <TextInput label="Hersteller" required {...bind('make')} />
              <TextInput label="Modell" required {...bind('model')} />
              <TextInput
                label="Baujahr"
                inputMode="numeric"
                {...bind('year')}
              />
              <TextInput label="Kennzeichen" {...bind('registration')} />
              <TextInput label="Fahrzeugtyp" {...bind('vehicleType')} />
              <TextInput
                label="Hubraum (cm³)"
                inputMode="numeric"
                {...bind('displacementCc')}
              />
              <TextInput
                label="Zylinder"
                inputMode="numeric"
                {...bind('cylinders')}
              />
              <TextInput label="Besitzer" {...bind('ownerName')} />
              <FormWide>
                <Textarea
                  label="Fahrzeughistorie"
                  maxLength={4000}
                  {...bind('history')}
                />
              </FormWide>
            </FormGrid>
            {error && <p role="alert">{error}</p>}
            <div className="nb-form-actions">
              <Button
                type="submit"
                size={40}
                disabled={busy || !draft.make?.trim() || !draft.model?.trim()}
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
            <FieldItem label="Hersteller · Modell">
              <Value>{`${vehicle.make} ${vehicle.model}`.trim()}</Value>
            </FieldItem>
            <FieldItem label="Baujahr">
              <Value>{vehicle.year}</Value>
            </FieldItem>
            <FieldItem label="Fahrzeugtyp">
              <Value>{vehicle.vehicleType}</Value>
            </FieldItem>
            <FieldItem label="Hubraum">
              <Value>
                {vehicle.displacementCc
                  ? `${vehicle.displacementCc} cm³`
                  : null}
              </Value>
            </FieldItem>
            <FieldItem label="Zylinder">
              <Value>{vehicle.cylinders}</Value>
            </FieldItem>
            <FieldItem label="Besitzer">
              <Value>{vehicle.ownerName}</Value>
            </FieldItem>
            <FieldItem label="Kennzeichen">
              <Value>{vehicle.registration}</Value>
            </FieldItem>
            <FieldItem label="Fahrzeughistorie" wide>
              <Value>{vehicle.history}</Value>
            </FieldItem>
          </FieldGrid>
        )}
      </div>
    </DetailSection>
  );
}
