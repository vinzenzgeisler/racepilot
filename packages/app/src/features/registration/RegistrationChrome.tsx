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
        <div className="registration-header-copy">
          <div className="registration-brand">
            {payload.registrationFormConfig.branding.logoLightObjectId ? (
              <img
                className="registration-logo"
                src={
                  '/public/organizations/' +
                  encodeURIComponent(organizationId) +
                  '/events/' +
                  encodeURIComponent(eventSlug) +
                  '/registration-assets/' +
                  encodeURIComponent(
                    payload.registrationFormConfig.branding.logoLightObjectId,
                  )
                }
                alt=""
              />
            ) : eventSlug === 'historischer-bergpreis-2027' ? (
              <img
                className="registration-logo"
                src="/registration-demo-logo.svg"
                alt=""
              />
            ) : null}
            <p className="registration-organization-name">
              {payload.organization.name}
            </p>
          </div>
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
            {model.startingFeeMessage}
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
  const {
    locale,
    vehicles,
    estimateMessage,
    registrationCloseDate,
    draftMessage,
  } = model;
  const deadline =
    registrationCloseDate ?? (locale === 'de' ? 'Nicht festgelegt' : 'Not set');
  const feeSummary = vehicles.some((vehicle) => !vehicle.classId)
    ? model.startingFeeMessage
    : estimateMessage;
  return (
    <aside
      className="registration-summary"
      aria-label={locale === 'de' ? 'Deine Nennung' : 'Your entry'}
    >
      <h3>{locale === 'de' ? 'Deine Nennung' : 'Your entry'}</h3>
      <dl>
        <div className="registration-summary-row">
          <dt>{locale === 'de' ? 'Fahrer' : 'Driver'}</dt>
          <dd>
            {[model.values.firstName, model.values.lastName]
              .filter(Boolean)
              .join(' ') || '—'}
          </dd>
        </div>
        <div className="registration-summary-row">
          <dt>{locale === 'de' ? 'Startmeldungen' : 'Entries'}</dt>
          <dd>{vehicles.length}</dd>
        </div>
        <div className="registration-summary-row">
          <dt>{locale === 'de' ? 'Startgeld' : 'Entry fee'}</dt>
          <dd>{feeSummary}</dd>
        </div>
        <div className="registration-summary-row">
          <dt>{locale === 'de' ? 'Nennungsschluss' : 'Deadline'}</dt>
          <dd>{deadline}</dd>
        </div>
      </dl>
      {draftMessage &&
        (draftMessage.startsWith('Entwurf gespeichert') ||
          draftMessage.startsWith('Draft saved')) && (
          <p className="registration-draft-status" role="status">
            {draftMessage}
          </p>
        )}
    </aside>
  );
}
