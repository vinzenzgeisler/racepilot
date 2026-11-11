import { Button, Field, SelectField } from '@racepilot/ui';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { FormPayload, VehicleEntry } from './RegistrationDomain.js';
import { emptyVehicle, translations } from './RegistrationDomain.js';
import { RegistrationVehicleDetailFields } from './RegistrationVehicleDetailFields.js';

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
  numberLookupRef,
  numberAvailability,
  setNumberAvailability,
  organizationId,
  eventSlug,
  validateCurrent,
}: {
  field: VehicleField;
  locale: Locale;
  vehicles: VehicleEntry[];
  setVehicle: (index: number, patch: Partial<VehicleEntry>) => void;
  setVehicles: Dispatch<SetStateAction<VehicleEntry[]>>;
  payload: FormPayload;
  t: Words;
  numberLookupRef: { current: Record<number, string> };
  numberAvailability: Record<number, boolean | null>;
  setNumberAvailability: Dispatch<
    SetStateAction<Record<number, boolean | null>>
  >;
  organizationId: string;
  eventSlug: string;
  validateCurrent: () => boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(
    vehicles.length - 1,
  );
  const remove = (index: number) => {
    numberLookupRef.current = {};
    setNumberAvailability({});
    setVehicles((old) => old.filter((_, current) => current !== index));
    setActiveIndex((current) =>
      current === null
        ? null
        : current === index
          ? null
          : current > index
            ? current - 1
            : current,
    );
  };
  return (
    <div className="registration-vehicle-fields">
      {vehicles.map((item, index) =>
        index !== activeIndex ? (
          <div className="registration-vehicle-summary" key={index}>
            <strong className="registration-vehicle-number">
              {item.requestedStartNumber || `${index + 1}`}
            </strong>
            <div>
              <strong>
                {[item.make, item.model, item.year].filter(Boolean).join(' ')}
              </strong>
              <p>
                {
                  payload.classes.find((option) => option.id === item.classId)
                    ?.name
                }
              </p>
            </div>
            <div className="registration-vehicle-summary-actions">
              <Button
                type="button"
                variant="text"
                onClick={() => {
                  if (activeIndex === null || validateCurrent())
                    setActiveIndex(index);
                }}
              >
                {locale === 'de' ? 'Bearbeiten' : 'Edit'}
              </Button>
              {vehicles.length > 1 && (
                <Button
                  type="button"
                  variant="text"
                  onClick={() => remove(index)}
                >
                  {t.remove}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="registration-vehicle-editor" key={index}>
            {vehicles.length > 1 && (
              <h3>
                {locale === 'de' ? 'Weitere Startmeldung' : 'Additional entry'}
              </h3>
            )}
            <fieldset className="vehicle-card">
              <legend>
                {field.label[locale]} {index + 1}
              </legend>
              <SelectField
                label={t.class}
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
                        (entry, i) =>
                          i !== index && entry.classId === option.id,
                      ) &&
                      item.classId !== option.id
                    }
                  >
                    {option.name} ({option.code})
                  </option>
                ))}
              </SelectField>
              {payload.registrationFormConfig.fields.requestedStartNumber
                .state !== 'hidden' && (
                <Field
                  label={
                    locale === 'de' ? 'Wunsch-Startnummer' : 'Requested number'
                  }
                  maxLength={16}
                  value={item.requestedStartNumber}
                  {...(item.requestedStartNumber
                    ? {
                        hint:
                          numberAvailability[index] === true
                            ? locale === 'de'
                              ? 'Startnummer ist frei'
                              : 'Number is available'
                            : numberAvailability[index] === false
                              ? locale === 'de'
                                ? 'Startnummer ist bereits vergeben'
                                : 'Number is already taken'
                              : locale === 'de'
                                ? 'Startnummer wird geprüft …'
                                : 'Checking number …',
                      }
                    : {})}
                  onChange={(e) => {
                    const requestedStartNumber = e.target.value;
                    numberLookupRef.current[index] = requestedStartNumber;
                    setVehicle(index, { requestedStartNumber });
                    setNumberAvailability((old) => ({ ...old, [index]: null }));
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
                            numberLookupRef.current[index] ===
                              requestedStartNumber
                          )
                            setNumberAvailability((old) => ({
                              ...old,
                              [index]: body.available === true,
                            }));
                        })
                        .catch(() => undefined);
                  }}
                />
              )}
              <Field
                label={t.make}
                required
                value={item.make}
                onChange={(e) => setVehicle(index, { make: e.target.value })}
              />
              <Field
                label={t.model}
                required
                value={item.model}
                onChange={(e) => setVehicle(index, { model: e.target.value })}
              />
              <Field
                label={t.year}
                type="number"
                min="1886"
                max="2200"
                value={item.year}
                onChange={(e) => setVehicle(index, { year: e.target.value })}
              />
              <Field
                label={t.registration}
                value={item.registration}
                onChange={(e) =>
                  setVehicle(index, { registration: e.target.value })
                }
              />
              <RegistrationVehicleDetailFields
                config={payload.registrationFormConfig}
                vehicle={item}
                onChange={(patch) => setVehicle(index, patch)}
                t={t}
              />
            </fieldset>
            <div className="registration-vehicle-editor-actions">
              {vehicles.length > 1 && (
                <Button
                  type="button"
                  variant="text"
                  onClick={() => remove(index)}
                >
                  {t.remove}
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (validateCurrent()) setActiveIndex(null);
                }}
              >
                {locale === 'de' ? 'Startmeldung übernehmen' : 'Use entry'}
              </Button>
            </div>
          </div>
        ),
      )}
      {activeIndex === null &&
        payload.registrationFormConfig.features.multipleEntries && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setActiveIndex(vehicles.length);
              setVehicles((old) => [...old, emptyVehicle()]);
            }}
          >
            {t.addVehicle}
          </Button>
        )}
    </div>
  );
}
