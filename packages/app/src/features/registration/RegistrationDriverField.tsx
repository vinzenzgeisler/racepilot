import { Field } from '@racepilot/ui';
import type { StandardRegistrationForm } from '@racepilot/contracts';
import type { RegistrationModel } from './RegistrationModel.js';

type DriverField = StandardRegistrationForm['steps'][number]['fields'][number];

export function RegistrationDriverField({
  field,
  locale,
  value,
  onChange,
}: {
  field: DriverField;
  locale: 'de' | 'en';
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      label={field.label[locale]}
      type={field.type}
      {...(field.key === 'dateOfBirth' ? { placeholder: 'TT.MM.JJJJ' } : {})}
      {...(field.key === 'email'
        ? {
            hint:
              locale === 'de'
                ? 'Bestätigungslink wird gesendet'
                : 'A confirmation link will be sent',
          }
        : {})}
      required={field.required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function driverFieldValue(
  values: RegistrationModel['values'],
  key: string,
): string {
  switch (key) {
    case 'firstName':
      return values.firstName;
    case 'lastName':
      return values.lastName;
    case 'email':
      return values.email;
    case 'dateOfBirth':
      return values.dateOfBirth;
    default:
      return '';
  }
}

export function updateDriverField(
  values: RegistrationModel['values'],
  key: string,
  value: string,
): RegistrationModel['values'] {
  switch (key) {
    case 'firstName':
      return { ...values, firstName: value };
    case 'lastName':
      return { ...values, lastName: value };
    case 'email':
      return { ...values, email: value };
    case 'dateOfBirth':
      return { ...values, dateOfBirth: value };
    default:
      return values;
  }
}
