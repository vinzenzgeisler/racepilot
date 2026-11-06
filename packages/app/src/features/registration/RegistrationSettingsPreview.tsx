import { Button, Field, FormGrid, FormSection, Steps } from '@racepilot/ui';
import {
  deriveAccessibleBrandColors,
  type RegistrationFormConfig,
} from '@racepilot/contracts';
import { registrationFieldLabels } from './registrationFieldLabels.js';

const driverPreviewFields = [
  'phone',
  'street',
  'postalCode',
  'city',
  'emergencyContact',
  'publicationPreference',
] as const;
const vehiclePreviewFields = [
  'displacement',
  'cylinders',
  'owner',
  'history',
] as const;

function PreviewFields({
  config,
  keys,
}: {
  config: RegistrationFormConfig;
  keys: ReadonlyArray<keyof RegistrationFormConfig['fields']>;
}) {
  return (
    <FormGrid>
      {keys.flatMap((key) => {
        const state = config.fields[key].state;
        if (state === 'hidden') return [];
        const required = state === 'required';
        const label = registrationFieldLabels[key] ?? key;
        if (key === 'emergencyContact')
          return [
            <Field
              key="emergency-name"
              label="Notfallkontakt · Name"
              required={required}
              value=""
              readOnly
            />,
            <Field
              key="emergency-phone"
              label="Notfallkontakt · Telefon"
              type="tel"
              required={required}
              value=""
              readOnly
            />,
          ];
        return [
          <Field
            key={key}
            label={`${label}${required ? ' · Pflicht' : ' · Freiwillig'}`}
            required={required}
            type={key === 'phone' ? 'tel' : 'text'}
            value=""
            readOnly
          />,
        ];
      })}
    </FormGrid>
  );
}

export function RegistrationSettingsPreview({
  config,
}: {
  config: RegistrationFormConfig;
}) {
  const colors = deriveAccessibleBrandColors(
    config.branding.primaryColor,
    config.branding.accentColor,
  );
  return (
    <FormSection
      title="Vorschau"
      description="So erscheint das Formular für Teilnehmende."
    >
      <div
        className="registration settings-registration-preview"
        style={
          {
            '--brand-primary': colors.primarySurface,
            '--brand-primary-text': colors.primaryForeground,
            '--brand-accent': colors.accentSurface,
            '--brand-accent-text': colors.accentForeground,
            '--brand-radius':
              config.branding.corners === 'rounded' ? '6px' : '0',
          } as React.CSSProperties
        }
      >
        <header className="registration-header">
          {config.branding.logoLightObjectId && (
            <span className="registration-preview-logo">NENNBOX</span>
          )}
          <p className="registration-event-date">
            12. Juni 2027 · Beispielveranstaltung
          </p>
          <h2>{config.welcomeText || 'Beispiel-Bergpreis'}</h2>
        </header>
        <Steps
          steps={['Fahrer', 'Startmeldungen', 'Prüfen']}
          current={0}
          label="Anmeldeschritte"
          completedLabel="Abgeschlossen"
        />
        <FormSection title="Fahrerdaten">
          <PreviewFields config={config} keys={driverPreviewFields} />
        </FormSection>
        <FormSection title="Startmeldung">
          <PreviewFields config={config} keys={vehiclePreviewFields} />
        </FormSection>
        <Button type="button" disabled>
          Weiter
        </Button>
      </div>
    </FormSection>
  );
}
