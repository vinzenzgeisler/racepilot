import type { RegistrationModel } from './RegistrationModel.js';
export function RegistrationHeader({
  model,
  organizationId,
  eventSlug,
}: {
  model: RegistrationModel;
  organizationId: string;
  eventSlug: string;
}) {
  const { locale, setLocale, payload, contrastColors, steps, step } = model;
  return (
    <>
      <div
        className="registration-language"
        role="group"
        aria-label="Language / Sprache"
      >
        <button
          type="button"
          aria-pressed={locale === 'de'}
          onClick={() => setLocale('de')}
        >
          Deutsch
        </button>
        <button
          type="button"
          aria-pressed={locale === 'en'}
          onClick={() => setLocale('en')}
        >
          English
        </button>
      </div>
      <header className="registration-header">
        {payload.registrationFormConfig.branding.logoLightObjectId && (
          <img
            className="registration-logo"
            src={`/public/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/registration-assets/${encodeURIComponent(payload.registrationFormConfig.branding.logoLightObjectId)}`}
            alt=""
          />
        )}
        {payload.registrationFormConfig.branding.headerImageObjectId && (
          <img
            className="registration-header-image"
            src={`/public/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/registration-assets/${encodeURIComponent(payload.registrationFormConfig.branding.headerImageObjectId)}`}
            alt=""
          />
        )}
        <p className="registration-event-date">{payload.event.startsOn}</p>
        <h2 id="registration-title">{payload.event.name}</h2>
        {payload.registrationFormConfig.welcomeText && (
          <p>{payload.registrationFormConfig.welcomeText}</p>
        )}
      </header>
      {contrastColors.contrastNotice && (
        <p className="registration-contrast-note" role="note">
          {locale === 'de'
            ? 'Schriftfarben werden automatisch für gute Lesbarkeit angepasst.'
            : 'Text colors are automatically adjusted for readability.'}
        </p>
      )}
      <ol
        className="registration-steps"
        aria-label={locale === 'de' ? 'Anmeldeschritte' : 'Registration steps'}
      >
        {steps.map((item, index) => (
          <li key={item.id} aria-current={index === step ? 'step' : undefined}>
            {item.title[locale]}
          </li>
        ))}
      </ol>
    </>
  );
}
export function RegistrationSummary({ model }: { model: RegistrationModel }) {
  const { locale, vehicles, estimateMessage, registrationCloseDate } = model;
  return (
    <aside
      className="registration-summary"
      aria-label={locale === 'de' ? 'Deine Nennung' : 'Your entry'}
    >
      <h3>{locale === 'de' ? 'Deine Nennung' : 'Your entry'}</h3>
      <p>
        {vehicles.length}{' '}
        {locale === 'de' ? 'Startmeldung(en)' : 'entry/entries'}
      </p>
      <p>
        {locale === 'de' ? 'Startgeld' : 'Entry fee'} · {estimateMessage}
      </p>
      <p>
        {locale === 'de' ? 'Nennungsschluss' : 'Deadline'} ·{' '}
        {registrationCloseDate ??
          (locale === 'de'
            ? 'Kein Nennungsschluss festgelegt'
            : 'No registration deadline set')}
      </p>
    </aside>
  );
}
