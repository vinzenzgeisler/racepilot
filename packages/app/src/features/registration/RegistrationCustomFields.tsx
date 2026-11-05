import {
  Button,
  Checkbox,
  Field,
  FormSection,
  SelectField,
  Textarea,
} from '@racepilot/ui';
import type {
  RegistrationCustomField,
  RegistrationFormConfig,
} from '@racepilot/contracts';

type UpdateConfig = (
  updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
) => void;
type ChangeConfig = (patch: Partial<RegistrationFormConfig>) => void;
type UpdateCustomField = (
  key: string,
  patch: Partial<RegistrationCustomField>,
) => void;

export function RegistrationCustomFields({
  activeConfig,
  updateConfig,
  updateCustomField,
  change,
}: {
  activeConfig: RegistrationFormConfig;
  updateConfig: UpdateConfig;
  updateCustomField: UpdateCustomField;
  change: ChangeConfig;
}) {
  return (
    <FormSection
      title="Eigene Felder"
      description="Text-, Auswahl-, Ja/Nein- und sichere Bilddatei-Felder erscheinen im Fahrerschritt."
    >
      {activeConfig.customFields.map((field) => (
        <FormSection title={field.key} key={field.key}>
          <SelectField
            label="Typ"
            value={field.type}
            onChange={(event) => {
              const type = event.target
                .value as RegistrationCustomField['type'];
              updateConfig((current) => ({
                ...current,
                customFields: current.customFields.map((item) => {
                  if (item.key !== field.key) return item;
                  const updated = { ...item, type };
                  if (type !== 'select') delete updated.options;
                  return type === 'select'
                    ? {
                        ...updated,
                        type,
                        options: [
                          {
                            value: 'option-1',
                            label: { de: 'Option 1', en: 'Option 1' },
                          },
                        ],
                      }
                    : updated;
                }),
              }));
            }}
          >
            <option value="text">Text</option>
            <option value="select">Auswahl</option>
            <option value="yes_no">Ja / Nein</option>
            <option value="file">Bilddatei</option>
          </SelectField>
          <Field label="Feldschlüssel" value={field.key} readOnly />
          <Field
            label="Bezeichnung · Deutsch"
            maxLength={120}
            value={field.label.de}
            onChange={(event) =>
              updateCustomField(field.key, {
                label: { ...field.label, de: event.target.value },
              })
            }
          />
          <Field
            label="Bezeichnung · English"
            maxLength={120}
            value={field.label.en}
            onChange={(event) =>
              updateCustomField(field.key, {
                label: { ...field.label, en: event.target.value },
              })
            }
          />
          {field.type === 'select' && (
            <Textarea
              label="Optionen · je Zeile Wert|Deutsch|English"
              value={(field.options ?? [])
                .map(
                  (option) =>
                    `${option.value}|${option.label.de}|${option.label.en}`,
                )
                .join('\n')}
              onChange={(event) =>
                updateCustomField(field.key, {
                  options: event.target.value
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => {
                      const [value, de, en] = line.split('|');
                      return {
                        value: value ?? '',
                        label: { de: de ?? '', en: en ?? '' },
                      };
                    }),
                })
              }
            />
          )}
          <Checkbox
            label="Pflichtfeld"
            checked={field.required}
            onChange={(event) =>
              updateCustomField(field.key, { required: event.target.checked })
            }
          />
          <Button
            type="button"
            variant="text"
            onClick={() =>
              change({
                customFields: activeConfig.customFields.filter(
                  (item) => item.key !== field.key,
                ),
              })
            }
          >
            Eigenes Feld entfernen
          </Button>
        </FormSection>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={activeConfig.customFields.length >= 30}
        onClick={() => {
          const key = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          change({
            customFields: [
              ...activeConfig.customFields,
              {
                key,
                type: 'text',
                required: false,
                label: { de: 'Neues Feld', en: 'New field' },
              },
            ],
          });
        }}
      >
        Eigenes Feld hinzufügen
      </Button>
    </FormSection>
  );
}
