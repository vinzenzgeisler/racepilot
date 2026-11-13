import { Checkbox, Field, FormGrid, FormWide } from '@racepilot/ui';
import type { PassengerMode } from '@racepilot/contracts';
import type { VehicleEntry, translations } from './RegistrationDomain.js';

type Words = (typeof translations)[keyof typeof translations];

/** Optional co-driver and spare vehicle of one start entry, as far as class and event allow them. */
export function RegistrationVehicleExtras({
  vehicle,
  passengerMode,
  spareVehicle,
  onChange,
  t,
}: {
  vehicle: VehicleEntry;
  passengerMode: PassengerMode;
  spareVehicle: boolean;
  onChange: (patch: Partial<VehicleEntry>) => void;
  t: Words;
}) {
  const passengerRequired = passengerMode === 'required';
  const passengerShown = passengerRequired || vehicle.passengerEnabled;
  return (
    <FormGrid variant="registration">
      {passengerMode !== 'none' && (
        <>
          <FormWide>
            <Checkbox
              label={t.addPassenger}
              checked={passengerShown}
              disabled={passengerRequired}
              onChange={(event) =>
                onChange({ passengerEnabled: event.target.checked })
              }
            />
            {passengerRequired && <p>{t.passengerRequired}</p>}
          </FormWide>
          {passengerShown && (
            <>
              <Field
                label={t.passengerFirstName}
                required
                maxLength={100}
                value={vehicle.passengerFirstName}
                onChange={(event) =>
                  onChange({ passengerFirstName: event.target.value })
                }
              />
              <Field
                label={t.passengerLastName}
                required
                maxLength={100}
                value={vehicle.passengerLastName}
                onChange={(event) =>
                  onChange({ passengerLastName: event.target.value })
                }
              />
              <FormWide>
                <Field
                  label={t.passengerEmail}
                  type="email"
                  maxLength={254}
                  hint={t.passengerHint}
                  value={vehicle.passengerEmail}
                  onChange={(event) =>
                    onChange({ passengerEmail: event.target.value })
                  }
                />
              </FormWide>
            </>
          )}
        </>
      )}
      {spareVehicle && (
        <>
          <FormWide>
            <Checkbox
              label={t.addSpareVehicle}
              checked={vehicle.spareVehicleEnabled}
              onChange={(event) =>
                onChange({ spareVehicleEnabled: event.target.checked })
              }
            />
            <p>{t.spareVehicleHint}</p>
          </FormWide>
          {vehicle.spareVehicleEnabled && (
            <>
              <Field
                label={t.spareVehicleMake}
                required
                maxLength={100}
                value={vehicle.spareVehicleMake}
                onChange={(event) =>
                  onChange({ spareVehicleMake: event.target.value })
                }
              />
              <Field
                label={t.spareVehicleModel}
                required
                maxLength={100}
                value={vehicle.spareVehicleModel}
                onChange={(event) =>
                  onChange({ spareVehicleModel: event.target.value })
                }
              />
              <Field
                label={t.spareVehicleYear}
                type="number"
                min="1886"
                max="2200"
                value={vehicle.spareVehicleYear}
                onChange={(event) =>
                  onChange({ spareVehicleYear: event.target.value })
                }
              />
              <Field
                label={t.spareVehicleRegistration}
                maxLength={64}
                value={vehicle.spareVehicleRegistration}
                onChange={(event) =>
                  onChange({ spareVehicleRegistration: event.target.value })
                }
              />
            </>
          )}
        </>
      )}
    </FormGrid>
  );
}
