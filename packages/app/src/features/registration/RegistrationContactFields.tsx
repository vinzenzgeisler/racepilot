import {
  Field,
  FormGrid,
  FormSection,
  FormWide,
  SelectField,
} from '@racepilot/ui';
import type { RegistrationFormConfig } from '@racepilot/contracts';
import {
  fieldState,
  type DriverContact,
  type translations,
} from './RegistrationDomain.js';

type Words = (typeof translations)[keyof typeof translations];

/** Driver contact data the event asks for; hidden fields are not rendered at all. */
export function RegistrationContactFields({
  config,
  values,
  onChange,
  t,
}: {
  config: RegistrationFormConfig;
  values: DriverContact;
  onChange: (patch: Partial<DriverContact>) => void;
  t: Words;
}) {
  const state = (key: keyof RegistrationFormConfig['fields']) =>
    fieldState(config, key);
  const set = (key: keyof DriverContact) => (value: string) =>
    onChange({ [key]: value });
  const text = (
    key: Exclude<keyof DriverContact, 'publicationPreference'>,
    field: keyof RegistrationFormConfig['fields'],
    type: 'text' | 'tel' = 'text',
  ) =>
    state(field) !== 'hidden' && (
      <Field
        label={t[key]}
        type={type}
        required={state(field) === 'required'}
        maxLength={key === 'street' ? 200 : key === 'postalCode' ? 20 : 100}
        value={values[key]}
        onChange={(event) => set(key)(event.target.value)}
      />
    );
  const emergency = state('emergencyContact');
  return (
    <FormGrid variant="registration">
      {text('phone', 'phone', 'tel')}
      {state('country') !== 'hidden' && (
        <SelectField
          label={t.country}
          required={state('country') === 'required'}
          value={values.country}
          onChange={(event) => set('country')(event.target.value)}
        >
          <option value="">{t.countryNotGiven}</option>
          <option value="DE">{t.germany}</option>
          <option value="AT">{t.austria}</option>
          <option value="CH">{t.switzerland}</option>
        </SelectField>
      )}
      {state('publicationPreference') !== 'hidden' && (
        <SelectField
          label={t.publicationPreference}
          required={state('publicationPreference') === 'required'}
          value={values.publicationPreference}
          onChange={(event) => set('publicationPreference')(event.target.value)}
        >
          <option value="">{t.publicationNotGiven}</option>
          <option value="name_visible">{t.publicationNameVisible}</option>
          <option value="initials">{t.publicationInitials}</option>
          <option value="hidden">{t.publicationHidden}</option>
        </SelectField>
      )}
      {(state('street') !== 'hidden' ||
        state('postalCode') !== 'hidden' ||
        state('city') !== 'hidden') && (
        <FormWide>
          <FormSection title={t.address} variant="registration">
            <FormGrid variant="registration">
              {text('street', 'street')}
              {text('postalCode', 'postalCode')}
              {text('city', 'city')}
            </FormGrid>
          </FormSection>
        </FormWide>
      )}
      {emergency !== 'hidden' && (
        <FormWide>
          <FormSection title={t.emergencyContact} variant="registration">
            <FormGrid variant="registration">
              <Field
                label={t.emergencyContactName}
                aria-label={`${t.emergencyContact} · ${t.emergencyContactName}`}
                required={
                  emergency === 'required' ||
                  Boolean(values.emergencyContactPhone)
                }
                maxLength={200}
                value={values.emergencyContactName}
                onChange={(event) =>
                  set('emergencyContactName')(event.target.value)
                }
              />
              <Field
                label={t.emergencyContactPhone}
                aria-label={`${t.emergencyContact} · ${t.emergencyContactPhone}`}
                type="tel"
                // An emergency contact is one unit: giving the name makes the number necessary.
                required={
                  emergency === 'required' ||
                  Boolean(values.emergencyContactName)
                }
                maxLength={40}
                value={values.emergencyContactPhone}
                onChange={(event) =>
                  set('emergencyContactPhone')(event.target.value)
                }
              />
            </FormGrid>
          </FormSection>
        </FormWide>
      )}
    </FormGrid>
  );
}
