import { Field, FileUpload, SelectField, Textarea } from '@racepilot/ui';
import type { Dispatch, SetStateAction } from 'react';
import type { RegistrationCustomField } from '@racepilot/contracts';

type Answer = string | boolean | { objectId: string; uploadToken: string };

function textAnswer(answer: Answer | undefined): string {
  return typeof answer === 'string' ? answer : '';
}

export function RegistrationCustomAnswers({
  fields,
  locale,
  customAnswers,
  setCustomAnswers,
  uploadedNames,
  uploadCustomField,
}: {
  fields: RegistrationCustomField[];
  locale: 'de' | 'en';
  customAnswers: Record<string, Answer>;
  setCustomAnswers: Dispatch<SetStateAction<Record<string, Answer>>>;
  uploadedNames: Record<string, string>;
  uploadCustomField: (fieldKey: string, file: File) => Promise<void>;
}) {
  return (
    <>
      {fields.map((field) => (
        <div
          className={
            field.key === 'biography' || field.key === 'organizer_notes'
              ? 'registration-wide'
              : undefined
          }
          key={field.key}
        >
          {field.type === 'text' &&
            (field.key === 'biography' || field.key === 'organizer_notes' ? (
              <Textarea
                label={field.label[locale]}
                maxLength={2000}
                required={field.required}
                value={textAnswer(customAnswers[field.key])}
                onChange={(event) =>
                  setCustomAnswers((old) => ({
                    ...old,
                    [field.key]: event.target.value,
                  }))
                }
              />
            ) : (
              <Field
                label={field.label[locale]}
                maxLength={2000}
                required={field.required}
                value={textAnswer(customAnswers[field.key])}
                onChange={(event) =>
                  setCustomAnswers((old) => ({
                    ...old,
                    [field.key]: event.target.value,
                  }))
                }
              />
            ))}
          {field.type === 'select' && (
            <SelectField
              label={field.label[locale]}
              required={field.required}
              value={textAnswer(customAnswers[field.key])}
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
            </SelectField>
          )}
          {field.type === 'yes_no' && (
            <SelectField
              label={field.label[locale]}
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
            </SelectField>
          )}
          {field.type === 'file' && (
            <>
              <FileUpload
                label={field.label[locale]}
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
        </div>
      ))}
    </>
  );
}
