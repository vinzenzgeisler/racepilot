import type { Dispatch, SetStateAction } from 'react';
import type { FormPayload, VehicleEntry } from './RegistrationDomain.js';
import { translations } from './RegistrationDomain.js';

type Locale = 'de' | 'en';
type VehicleField = { key: string; label: { de: string; en: string } };
type Words = (typeof translations)[Locale];

export function RegistrationVehicleFields({
  field,
  locale,
  vehicles,
  setVehicle,
  setVehicles,
  payload,
  t,
  numberLookup,
  numberAvailability,
  setNumberAvailability,
  organizationId,
  eventSlug,
}: {
  field: VehicleField;
  locale: Locale;
  vehicles: VehicleEntry[];
  setVehicle: (index: number, patch: Partial<VehicleEntry>) => void;
  setVehicles: Dispatch<SetStateAction<VehicleEntry[]>>;
  payload: FormPayload;
  t: Words;
  numberLookup: { current: Record<number, string> };
  numberAvailability: Record<number, boolean | null>;
  setNumberAvailability: Dispatch<
    SetStateAction<Record<number, boolean | null>>
  >;
  organizationId: string;
  eventSlug: string;
}) {
  return (
    <div key={field.key}>
      {vehicles.map((item, index) => (
        <fieldset className="vehicle-card" key={index}>
          <legend>
            {field.label[locale]} {index + 1}
          </legend>
          <label>
            {t.class}
            <select
              required
              value={item.classId}
              onChange={(e) => setVehicle(index, { classId: e.target.value })}
            >
              <option value="">—</option>
              {payload.classes.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={
                    new Set(
                      vehicles.map((entry) => entry.classId).filter(Boolean),
                    ).size >=
                      payload.registrationSettings.maximumClassesPerGroup &&
                    !vehicles.some(
                      (entry, i) => i !== index && entry.classId === option.id,
                    ) &&
                    item.classId !== option.id
                  }
                >
                  {option.name} ({option.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.make}
            <input
              required
              value={item.make}
              onChange={(e) => setVehicle(index, { make: e.target.value })}
            />
          </label>
          <label>
            {t.model}
            <input
              required
              value={item.model}
              onChange={(e) => setVehicle(index, { model: e.target.value })}
            />
          </label>
          <label>
            {t.year}
            <input
              type="number"
              min="1886"
              max="2200"
              value={item.year}
              onChange={(e) => setVehicle(index, { year: e.target.value })}
            />
          </label>
          <label>
            {t.registration}
            <input
              value={item.registration}
              onChange={(e) =>
                setVehicle(index, {
                  registration: e.target.value,
                })
              }
            />
          </label>
          {payload.registrationFormConfig.fields.requestedStartNumber.state !==
            'hidden' && (
            <label>
              {locale === 'de' ? 'Wunsch-Startnummer' : 'Requested number'}
              <input
                maxLength={16}
                value={item.requestedStartNumber}
                onChange={(e) => {
                  const requestedStartNumber = e.target.value;
                  numberLookup.current[index] = requestedStartNumber;
                  setVehicle(index, { requestedStartNumber });
                  setNumberAvailability((old) => ({
                    ...old,
                    [index]: null,
                  }));
                  if (requestedStartNumber.trim())
                    void fetch(
                      `/public/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/registration/start-number?number=${encodeURIComponent(requestedStartNumber)}`,
                    )
                      .then((response) =>
                        response.ok ? response.json() : null,
                      )
                      .then((body: { available?: boolean } | null) => {
                        if (
                          body &&
                          numberLookup.current[index] === requestedStartNumber
                        )
                          setNumberAvailability((old) => ({
                            ...old,
                            [index]: body.available === true,
                          }));
                      })
                      .catch(() => undefined);
                }}
              />
              {item.requestedStartNumber && (
                <small role="status">
                  {numberAvailability[index] === true
                    ? locale === 'de'
                      ? 'Startnummer ist frei'
                      : 'Number is available'
                    : numberAvailability[index] === false
                      ? locale === 'de'
                        ? 'Startnummer ist bereits vergeben'
                        : 'Number is already taken'
                      : locale === 'de'
                        ? 'Startnummer wird geprüft …'
                        : 'Checking number …'}
                </small>
              )}
            </label>
          )}
          {vehicles.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setVehicles((old) => old.filter((_, i) => i !== index))
              }
            >
              {t.remove}
            </button>
          )}
        </fieldset>
      ))}
      {payload.registrationFormConfig.features.multipleEntries && (
        <button
          type="button"
          onClick={() =>
            setVehicles((old) => [
              ...old,
              {
                classId: '',
                make: '',
                model: '',
                year: '',
                registration: '',
                requestedStartNumber: '',
              },
            ])
          }
        >
          {t.addVehicle}
        </button>
      )}
    </div>
  );
}
