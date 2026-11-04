import type { Dispatch, SetStateAction } from 'react';
import type { RegistrationCustomField } from '@racepilot/contracts';

type Answer = string | boolean | { objectId: string; uploadToken: string };

export function RegistrationCustomAnswers({
  isDriver,
  fields,
  locale,
  customAnswers,
  setCustomAnswers,
  uploadedNames,
  uploadCustomField,
}: {
  isDriver: boolean;
  fields: RegistrationCustomField[];
  locale: 'de' | 'en';
  customAnswers: Record<string, Answer>;
  setCustomAnswers: Dispatch<SetStateAction<Record<string, Answer>>>;
  uploadedNames: Record<string, string>;
  uploadCustomField: (fieldKey: string, file: File) => Promise<void>;
}) {
  if (!isDriver) return null;
  return (
    <>
      {fields.map((field) => (
        <label key={field.key}>
          {field.label[locale]}
          {field.type === 'text' && (
            <input
              type="text"
              maxLength={2000}
              required={field.required}
              value={
                typeof customAnswers[field.key] === 'string'
                  ? (customAnswers[field.key] as string)
                  : ''
              }
              onChange={(event) =>
                setCustomAnswers((old) => ({
                  ...old,
                  [field.key]: event.target.value,
                }))
              }
            />
          )}
          {field.type === 'select' && (
            <select
              required={field.required}
              value={
                typeof customAnswers[field.key] === 'string'
                  ? (customAnswers[field.key] as string)
                  : ''
              }
              onChange={(event) =>
                setCustomAnswers((old) => ({
                  ...old,
                  [field.key]: event.target.value,
                }))
              }
            >
              <option value="">
                {locale === 'de' ? 'Bitte auswählen' : 'Select an option'}
              </option>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[locale]}
                </option>
              ))}
            </select>
          )}
          {field.type === 'yes_no' && (
            <select
              required={field.required}
              value={
                typeof customAnswers[field.key] === 'boolean'
                  ? customAnswers[field.key]
                    ? 'yes'
                    : 'no'
                  : ''
              }
              onChange={(event) =>
                setCustomAnswers((old) => ({
                  ...old,
                  [field.key]: event.target.value === 'yes',
                }))
              }
            >
              <option value="">
                {locale === 'de' ? 'Bitte auswählen' : 'Select an option'}
              </option>
              <option value="yes">{locale === 'de' ? 'Ja' : 'Yes'}</option>
              <option value="no">{locale === 'de' ? 'Nein' : 'No'}</option>
            </select>
          )}
          {field.type === 'file' && (
            <>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required={
                  field.required && typeof customAnswers[field.key] !== 'object'
                }
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void uploadCustomField(field.key, file);
                }}
              />
              {uploadedNames[field.key] && (
                <small role="status">
                  {uploadedNames[field.key]} ·{' '}
                  {locale === 'de' ? 'sicher hochgeladen' : 'uploaded securely'}
                </small>
              )}
              {typeof customAnswers[field.key] === 'object' &&
                !uploadedNames[field.key] && (
                  <small role="status">
                    {locale === 'de'
                      ? 'Datei für Fortsetzung gespeichert'
                      : 'File retained for continuation'}
                  </small>
                )}
            </>
          )}
        </label>
      ))}
    </>
  );
}
