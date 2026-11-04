import type { ChangeEvent } from 'react';
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
      <div className="registration-admin-grid">
        <label>
          Primärfarbe
          <input
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
        </label>
        <label>
          Akzentfarbe
          <input
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
        </label>
        <label>
          Ecken
          <select
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
            <option value="rounded">6 px</option>
          </select>
        </label>
        <label>
          Überschriftenschrift
          <select value={activeConfig.branding.headingFont} disabled>
            <option value="archivo">Archivo · Brandbook M4</option>
          </select>
        </label>
        <label>
          Logo auf hellem Grund
          <input
            type="file"
            accept="image/svg+xml,image/png"
            onChange={(e) => void upload('logoLight', e)}
          />
        </label>
        <label>
          Logo auf dunklem Grund
          <input
            type="file"
            accept="image/svg+xml,image/png"
            onChange={(e) => void upload('logoDark', e)}
          />
        </label>
        <label>
          Kopfbild · optional
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void upload('headerImage', e)}
          />
        </label>
      </div>
      <label>
        Begrüßung
        <textarea
          maxLength={4000}
          value={activeConfig.welcomeText}
          onChange={(e) => change({ welcomeText: e.target.value })}
        />
      </label>
      <label>
        Hinweise des Veranstalters
        <textarea
          maxLength={10000}
          value={activeConfig.organizerNotice}
          onChange={(e) => change({ organizerNotice: e.target.value })}
        />
      </label>
    </>
  );
}
