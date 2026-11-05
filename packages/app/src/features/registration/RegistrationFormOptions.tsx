import { Checkbox, DataTable, FormSection, SelectField } from '@racepilot/ui';
import type { RegistrationFormConfig } from '@racepilot/contracts';

export function RegistrationFormOptions({
  config,
  updateConfig,
  fieldLabels,
}: {
  config: RegistrationFormConfig;
  updateConfig: (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => void;
  fieldLabels: Record<string, string>;
}) {
  return (
    <FormSection title="Felder · Pflicht, freiwillig oder aus">
      <DataTable headers={['Feld', 'Einstellung']}>
        {Object.entries(config.fields).map(([key, field]) => (
          <tr key={key}>
            <th scope="row">{fieldLabels[key] ?? key}</th>
            <td>
              {key === 'dateOfBirth' ? (
                'Pflicht · für Alters- und Erziehungsberechtigtenprüfung'
              ) : (
                <SelectField
                  label={`${fieldLabels[key] ?? key} · Einstellung`}
                  value={field.state}
                  onChange={(e) =>
                    updateConfig((x) => ({
                      ...x,
                      fields: {
                        ...x.fields,
                        [key]: {
                          state: e.target.value as typeof field.state,
                        },
                      },
                    }))
                  }
                >
                  <option value="required">Pflicht</option>
                  <option value="optional">Freiwillig</option>
                  <option value="hidden">Aus</option>
                </SelectField>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </FormSection>
  );
}

export function RegistrationFeatureOptions({
  config,
  updateConfig,
}: {
  config: RegistrationFormConfig;
  updateConfig: (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => void;
}) {
  return (
    <FormSection title="Veranstaltungsoptionen">
      <Checkbox
        label="Beifahrer"
        checked={config.features.passenger}
        onChange={(event) =>
          updateConfig((current) => ({
            ...current,
            features: { ...current.features, passenger: event.target.checked },
          }))
        }
      />
      <Checkbox
        label="Ersatzfahrzeug"
        checked={config.features.spareVehicle}
        onChange={(event) =>
          updateConfig((current) => ({
            ...current,
            features: {
              ...current.features,
              spareVehicle: event.target.checked,
            },
          }))
        }
      />
      <Checkbox
        label="Mehrere Starts"
        checked={config.features.multipleEntries}
        onChange={(event) =>
          updateConfig((current) => ({
            ...current,
            features: {
              ...current.features,
              multipleEntries: event.target.checked,
            },
          }))
        }
      />
    </FormSection>
  );
}
