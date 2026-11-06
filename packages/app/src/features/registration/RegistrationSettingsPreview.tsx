import {
  Button,
  FieldPreview,
  FieldPreviewList,
  FormSection,
  Steps,
} from '@racepilot/ui';
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
/** Hidden fields do not appear: the preview shows what the participant will see. */
function previewRows(
  config: RegistrationFormConfig,
  keys: ReadonlyArray<keyof RegistrationFormConfig['fields']>,
) {
  return keys.flatMap((key) => {
    const state = config.fields[key].state;
    return state === 'hidden'
      ? []
      : [
          <FieldPreview
            key={key}
            label={registrationFieldLabels[key] ?? key}
            state={state}
            stateLabel={state === 'required' ? 'Pflicht' : 'Freiwillig'}
          />,
        ];
  });
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
      description="Änderungen erscheinen hier sofort."
    >
      <div
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
        <header
          style={{
            background: 'var(--brand-primary)',
            borderRadius: 'var(--brand-radius)',
            color: 'var(--brand-primary-text)',
            padding: 'var(--space-3)',
          }}
        >
          <p className="eyebrow">Beispielveranstaltung · 12.–13. Juni 2027</p>
          <h3
            style={{
              color: 'inherit',
              fontFamily: 'var(--font-archivo)',
            }}
          >
            Beispiel-Bergpreis
          </h3>
          {config.welcomeText && <p>{config.welcomeText}</p>}
        </header>
        <p
          style={{
            background: 'var(--brand-accent)',
            borderRadius: 'var(--brand-radius)',
            color: 'var(--brand-accent-text)',
            padding: 'var(--space-2) var(--space-3)',
          }}
        >
          Startgeld · Nennungsschluss
        </p>
        <Steps
          steps={['Fahrer', 'Startmeldungen', 'Prüfen']}
          current={0}
          label="Anmeldeschritte"
          completedLabel="Abgeschlossen"
        />
        <FieldPreviewList
          title="Fahrerdaten · zusätzlich abgefragt"
          empty="Keine zusätzlichen Fahrerfelder"
        >
          {previewRows(config, driverPreviewFields)}
        </FieldPreviewList>
        <FieldPreviewList
          title="Je Fahrzeug · zusätzlich abgefragt"
          empty="Keine zusätzlichen Fahrzeugfelder"
        >
          {previewRows(config, vehiclePreviewFields)}
        </FieldPreviewList>
        <Button type="button" disabled>
          Weiter zu Startmeldungen
        </Button>
      </div>
    </FormSection>
  );
}
