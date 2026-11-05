import { Button, FormSection, Steps } from '@racepilot/ui';
import {
  deriveAccessibleBrandColors,
  type RegistrationFormConfig,
} from '@racepilot/contracts';

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
            borderBottom: 'var(--line-section) solid var(--brand-primary)',
            paddingBottom: 'var(--space-3)',
          }}
        >
          <p className="eyebrow">12.–13. JUNI 2027</p>
          <h3
            style={{
              color: 'var(--brand-primary)',
              fontFamily: 'var(--font-archivo)',
            }}
          >
            Historischer Bergpreis
          </h3>
          {config.welcomeText && <p>{config.welcomeText}</p>}
        </header>
        <p style={{ color: 'var(--brand-accent-text)' }}>
          Startgeld · Nennungsschluss
        </p>
        <Steps
          steps={['Fahrer', 'Startmeldungen', 'Prüfen']}
          current={0}
          label="Anmeldeschritte"
          completedLabel="Abgeschlossen"
        />
        <Button type="button" disabled>
          Weiter zu Startmeldungen
        </Button>
      </div>
    </FormSection>
  );
}
