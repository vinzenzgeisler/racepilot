import { useState } from 'react';
import {
  Banner,
  Button,
  DetailSection,
  FieldGrid,
  FieldItem,
  FieldValue,
  FormActions,
  FormGrid,
  FormWide,
  MediaDetail,
  TextInput,
  Textarea,
} from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { EntryVehicleUpdateRequest } from '@racepilot/contracts';
import { NOT_GIVEN, vehicleTypeLabel } from './entryDetailModel.js';
import type { Outcome } from '../AdminEntriesModel.js';

type Vehicle = NonNullable<Entry['adminDetails']>['vehicle'];
type EventClass = NonNullable<Entry['adminDetails']>['eventClass'];
const Value = ({
  children,
}: {
  children: string | number | null | undefined;
}) => <FieldValue empty={NOT_GIVEN}>{children}</FieldValue>;

export function EntryVehicleSection({
  vehicle,
  eventClass,
  busy,
  onSave,
}: {
  vehicle: Vehicle;
  eventClass?: EventClass | undefined;
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
    const next: EntryVehicleUpdateRequest = {
      make: draft.make?.trim() ?? '',
      model: draft.model?.trim() ?? '',
      year: number('year'),
      registration: text('registration'),
      displacementCc: number('displacementCc'),
      cylinders: number('cylinders'),
      ownerName: text('ownerName'),
      history: text('history'),
    };
    const current: Record<string, unknown> = {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year ?? null,
      registration: vehicle.registration ?? null,
      displacementCc: vehicle.displacementCc ?? null,
      cylinders: vehicle.cylinders ?? null,
      ownerName: vehicle.ownerName ?? null,
      history: vehicle.history ?? null,
    };
    const patch = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => current[key] !== value),
    ) as EntryVehicleUpdateRequest;
    if (!Object.keys(patch).length) return setEditing(false);
    const result = await onSave(patch);
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
      <MediaDetail
        imageUrl={vehicle.imageUrl ?? null}
        imageAlt="Fahrzeugbild"
        caption="Fahrzeugbild · Upload des Teilnehmers"
        emptyLabel="Kein Fahrzeugbild hochgeladen"
        below={
          editing ? (
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
              {error && <Banner tone="error">{error}</Banner>}
              <FormActions>
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
              </FormActions>
            </form>
          ) : undefined
        }
      >
        {editing ? null : (
          <FieldGrid>
            <FieldItem label="Hersteller · Modell">
              <Value>{`${vehicle.make} ${vehicle.model}`.trim()}</Value>
            </FieldItem>
            <FieldItem label="Baujahr">
              <Value>{vehicle.year}</Value>
            </FieldItem>
            <FieldItem label="Fahrzeugtyp">
              <Value>
                {vehicleTypeLabel(
                  vehicle.vehicleType ?? eventClass?.vehicleType,
                )}
              </Value>
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
      </MediaDetail>
    </DetailSection>
  );
}
