import { Field, FormGrid, FormWide, Textarea } from '@racepilot/ui';
import type { RegistrationFormConfig } from '@racepilot/contracts';
import {
  fieldState,
  type VehicleEntry,
  type translations,
} from './RegistrationDomain.js';

type Words = (typeof translations)[keyof typeof translations];

/** Technical details of one vehicle, as far as the event asks for them. */
export function RegistrationVehicleDetailFields({
  config,
  vehicle,
  onChange,
  t,
}: {
  config: RegistrationFormConfig;
  vehicle: VehicleEntry;
  onChange: (patch: Partial<VehicleEntry>) => void;
  t: Words;
}) {
  const state = (key: keyof RegistrationFormConfig['fields']) =>
    fieldState(config, key);
  const required = (key: keyof RegistrationFormConfig['fields']) =>
    state(key) === 'required';
  return (
    <FormGrid>
      {state('displacement') !== 'hidden' && (
        <Field
          label={t.displacement}
          type="number"
          min="1"
          max="20000"
          required={required('displacement')}
          value={vehicle.displacementCc}
          onChange={(event) => onChange({ displacementCc: event.target.value })}
        />
      )}
      {state('cylinders') !== 'hidden' && (
        <Field
          label={t.cylinders}
          type="number"
          min="1"
          max="24"
          required={required('cylinders')}
          value={vehicle.cylinders}
          onChange={(event) => onChange({ cylinders: event.target.value })}
        />
      )}
      {state('owner') !== 'hidden' && (
        <Field
          label={t.owner}
          required={required('owner')}
          maxLength={200}
          value={vehicle.ownerName}
          onChange={(event) => onChange({ ownerName: event.target.value })}
        />
      )}
      {state('history') !== 'hidden' && (
        <FormWide>
          <Textarea
            label={t.history}
            required={required('history')}
            maxLength={4000}
            value={vehicle.history}
            onChange={(event) => onChange({ history: event.target.value })}
          />
        </FormWide>
      )}
    </FormGrid>
  );
}
