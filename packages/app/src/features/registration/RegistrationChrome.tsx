import { Button } from '@racepilot/ui';
import type { RegistrationModel } from './RegistrationModel.js';

function formatEventStartDate(startsOn: string, locale: 'de' | 'en') {
  // Event dates are calendar dates, not instants; UTC prevents time-zone shifts.
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${startsOn}T00:00:00.000Z`));
}

export function RegistrationHeader({
  model,
  organizationId,
  eventSlug,
}: {
  model: RegistrationModel;
  organizationId: string;
  eventSlug: string;
}) {
  const { locale, setLocale, payload } = model;
  return (
    <header className="registration-header">
      <div className="registration-header-inner">
        <div
          className="registration-language"
          role="group"
          aria-label={locale === 'de' ? 'Sprache' : 'Language'}
        >
          <Button
            type="button"
            variant={locale === 'de' ? 'primary-dark' : 'secondary'}
            aria-label="Deutsch"
            aria-pressed={locale === 'de'}
            onClick={() => setLocale('de')}
          >
            DE
          </Button>
          <Button
            type="button"
            variant={locale === 'en' ? 'primary-dark' : 'secondary'}
            aria-label="English"
            aria-pressed={locale === 'en'}
            onClick={() => setLocale('en')}
          >
            EN
          </Button>
        </div>
        <div className="registration-header-copy">
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
          <p className="registration-event-date">
            {formatEventStartDate(payload.event.startsOn, locale)}
          </p>
          <h1 id="registration-title">{payload.event.name}</h1>
          <p>
            {payload.registrationFormConfig.welcomeText ||
              (locale === 'de'
                ? 'Schön, dass du dabei sein möchtest. Erfasse deine Nennung Schritt für Schritt und prüfe am Ende alles in Ruhe.'
                : 'We are glad you are joining us. Complete your registration step by step and review everything before submitting.')}
          </p>
        </div>
        <div className="registration-header-meta">
          <p className="registration-organization-name">
            {payload.organization.name}
          </p>
          {payload.organization.contactEmail && (
            <p>
              <span>{locale === 'de' ? 'Kontakt' : 'Contact'}</span>
              <a href={`mailto:${payload.organization.contactEmail}`}>
                {payload.organization.contactEmail}
              </a>
            </p>
          )}
          <p>
            <span>{locale === 'de' ? 'Startgeld' : 'Entry fee'}</span>
            {model.estimateMessage}
          </p>
          <p>
            <span>{locale === 'de' ? 'Nennungsschluss' : 'Deadline'}</span>
            {model.registrationCloseDate ?? '—'}
          </p>
        </div>
      </div>
    </header>
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
