import type { ChangeEvent } from 'react';
import {
  Field,
  FileUpload,
  FormSection,
  SelectField,
  Stack,
  Textarea,
} from '@racepilot/ui';
import type { RegistrationFormConfig } from '@racepilot/contracts';

type UpdateConfig = (
  updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
) => void;
type ChangeConfig = (patch: Partial<RegistrationFormConfig>) => void;

export function RegistrationAppearance({
  activeConfig,
  updateConfig,
  change,
  upload,
}: {
  activeConfig: RegistrationFormConfig;
  updateConfig: UpdateConfig;
  change: ChangeConfig;
  upload: (
    kind: 'logoLight' | 'logoDark' | 'headerImage',
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
}) {
  return (
    <>
      <FormSection title="Erscheinungsbild">
        <Stack gap={4}>
          <Field
            label="Primärfarbe"
            type="color"
            value={activeConfig.branding.primaryColor}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  primaryColor: e.target.value.toUpperCase(),
                },
              }))
            }
          />
          <Field
            label="Akzentfarbe"
            type="color"
            value={activeConfig.branding.accentColor}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  accentColor: e.target.value.toUpperCase(),
                },
              }))
            }
          />
          <SelectField
            label="Ecken"
            value={activeConfig.branding.corners}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  corners: e.target.value as 'square' | 'rounded',
                },
              }))
            }
          >
            <option value="square">Eckig</option>
            <option value="rounded">Leicht gerundet · 6 px</option>
          </SelectField>
          <SelectField
            label="Überschriftenschrift"
            value={activeConfig.branding.headingFont}
            disabled
          >
            <option value="archivo">Archivo · Brandbook M4</option>
          </SelectField>
          <FileUpload
            label="Logo auf hellem Grund"
            accept="image/svg+xml,image/png"
            onChange={(e) => void upload('logoLight', e)}
          />
          <FileUpload
            label="Logo auf dunklem Grund"
            accept="image/svg+xml,image/png"
            onChange={(e) => void upload('logoDark', e)}
          />
          <FileUpload
            label="Kopfbild · optional"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void upload('headerImage', e)}
          />
        </Stack>
      </FormSection>
      <Textarea
        label="Begrüßung"
        maxLength={4000}
        value={activeConfig.welcomeText}
        onChange={(e) => change({ welcomeText: e.target.value })}
      />
      <Textarea
        label="Hinweise des Veranstalters"
        maxLength={10000}
        value={activeConfig.organizerNotice}
        onChange={(e) => change({ organizerNotice: e.target.value })}
      />
    </>
  );
}
