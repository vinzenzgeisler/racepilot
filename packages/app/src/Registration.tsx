import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  PublicRegistrationRequestSchema,
  StandardRegistrationFormSchema,
  RegistrationFormConfigSchema,
  defaultRegistrationFormConfig,
  deriveAccessibleBrandColors,
  type RegistrationSettings,
  type StandardRegistrationForm,
  type RegistrationFormConfig,
} from '@racepilot/contracts';
import type { CSSProperties } from 'react';

type FormPayload = {
  form: StandardRegistrationForm;
  event: { id: string; slug: string; name: string; startsOn: string };
  classes: Array<{
    id: string;
    name: string;
    code: string;
    vehicleType: string;
    closed: boolean;
  }>;
  consents: Array<{
    key: string;
    version: string;
    language: 'de' | 'en';
    text: string;
    hash: string;
  }>;
  registrationSettings: RegistrationSettings;
  registrationFormConfig: RegistrationFormConfig;
};
type VehicleEntry = {
  classId: string;
  make: string;
  model: string;
  year: string;
  registration: string;
};
const translations = {
  de: {
    loading: 'Anmeldeformular wird geladen …',
    loadError: 'Das Formular ist momentan nicht verfügbar.',
    previous: 'Zurück',
    next: 'Weiter',
    submit: 'Nennung absenden',
    sending: 'Wird gesendet …',
    retry: 'Bitte prüfe deine Angaben und versuche es erneut.',
    minAge: 'Das Mindestalter dieser Organisation ist noch nicht erreicht.',
    consentUnavailable:
      'Die Anmeldung ist nicht verfügbar, weil für diese Veranstaltung kein Einwilligungstext hinterlegt ist.',
    submitted:
      'Die Nennung wurde angenommen. Bitte bestätige die E-Mail-Adresse über den zugesandten Link.',
    guardianName: 'Name der erziehungsberechtigten Person',
    guardianEmail: 'E-Mail der erziehungsberechtigten Person',
    addVehicle: 'Weiteres Fahrzeug hinzufügen',
    remove: 'Entfernen',
    class: 'Klasse',
    make: 'Hersteller',
    model: 'Modell',
    year: 'Baujahr',
    registration: 'Kennzeichen',
    consent: 'Ich stimme zu',
    emailError: 'Bitte gib eine gültige E-Mail-Adresse ein.',
  },
  en: {
    loading: 'Loading registration form …',
    loadError: 'The form is currently unavailable.',
    previous: 'Back',
    next: 'Continue',
    submit: 'Submit registration',
    sending: 'Sending …',
    retry: 'Check your details and try again.',
    minAge:
      'The driver does not meet the organization’s minimum age requirement.',
    consentUnavailable:
      'Registration is not available because this event has no published consent text.',
    submitted:
      'Your registration was accepted. Please verify your email using the link we sent.',
    guardianName: 'Parent or guardian name',
    guardianEmail: 'Parent or guardian email',
    addVehicle: 'Add another vehicle',
    remove: 'Remove',
    class: 'Class',
    make: 'Make',
    model: 'Model',
    year: 'Year',
    registration: 'Registration',
    consent: 'I agree',
    emailError: 'Enter a valid email address.',
  },
} as const;

function getAge(dob: string, on: string): number {
  if (!dob || !on) return 100;
  const birth = new Date(`${dob}T00:00:00Z`);
  const date = new Date(`${on}T00:00:00Z`);
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() &&
      date.getUTCDate() < birth.getUTCDate())
  )
    age--;
  return age;
}

export function Registration({
  organizationId,
  eventSlug,
  defaultLocale,
}: {
  organizationId: string;
  eventSlug: string;
  defaultLocale: string;
}) {
  const [locale, setLocale] = useState<'de' | 'en'>(
    defaultLocale.toLowerCase().startsWith('de') ? 'de' : 'en',
  );
  const t = translations[locale];
  const [payload, setPayload] = useState<FormPayload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    dateOfBirth: '',
    guardianName: '',
    guardianEmail: '',
  });
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([
    { classId: '', make: '', model: '', year: '', registration: '' },
  ]);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [submissionId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(
      `/public/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/registration/form`,
      { cache: 'no-store' },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body: unknown) => {
        if (!alive || !body || typeof body !== 'object') return;
        const value = body as FormPayload;
        const form = StandardRegistrationFormSchema.parse(value.form);
        const registrationFormConfig = RegistrationFormConfigSchema.parse(value.registrationFormConfig ?? defaultRegistrationFormConfig);
        if (alive) setPayload({ ...value, form, registrationFormConfig });
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [organizationId, eventSlug]);

  if (!payload && !loadError)
    return (
      <section aria-busy="true">
        <p role="status">{t.loading}</p>
      </section>
    );
  if (loadError || !payload)
    return (
      <section>
        <h2>{t.loadError}</h2>
        <p role="alert">{t.loadError}</p>
      </section>
    );
  const steps = payload.form.steps;
  const currentStep = steps[step];
  const contrastColors = deriveAccessibleBrandColors(payload.registrationFormConfig.branding.primaryColor, payload.registrationFormConfig.branding.accentColor);
  const age = getAge(values.dateOfBirth, payload.event.startsOn);
  const guardianRequired =
    age < payload.registrationSettings.guardianRequiredBelowAge;
  const setVehicle = (index: number, patch: Partial<VehicleEntry>) =>
    setVehicles((old) =>
      old.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length - 1) {
      if (formRef.current && !formRef.current.reportValidity()) return;
      setStep(step + 1);
      setError('');
      return;
    }
    setError('');
    if (
      payload!.registrationSettings.minimumAge !== null &&
      age < payload!.registrationSettings.minimumAge
    ) {
      setError(t.minAge);
      return;
    }
    setSubmitting(true);
    const request = {
      submissionId,
      formVersion: payload!.form.version,
      language: locale,
      eventSlug,
      person: {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        dateOfBirth: values.dateOfBirth,
        ...(guardianRequired
          ? {
              guardianName: values.guardianName,
              guardianEmail: values.guardianEmail,
            }
          : {}),
      },
      entries: vehicles.map((item) => ({
        classId: item.classId,
        vehicle: {
          make: item.make,
          model: item.model,
          year: item.year ? Number(item.year) : null,
          registration: item.registration || null,
        },
      })),
      consents: payload!.consents
        .filter((item) => item.language === locale)
        .map((item) => ({
          key: item.key,
          version: item.version,
          hash: item.hash,
          accepted:
            accepted[`${item.key}:${item.version}:${item.language}`] === true,
        })),
    };
    const parsed = PublicRegistrationRequestSchema.safeParse(request);
    if (!parsed.success) {
      setSubmitting(false);
      setError(t.retry);
      return;
    }
    try {
      const response = await fetch(
        `/public/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/registration/submissions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!response.ok) throw new Error();
      setSubmitted(true);
    } catch {
      setError(t.retry);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted)
    return (
      <section aria-labelledby="registration-success">
        <h2 id="registration-success">{payload.event.name}</h2>
        <p role="status">{t.submitted}</p>
      </section>
    );

  if (!payload.consents.some((item) => item.language === locale))
    return (
      <section>
        <h2>{payload.event.name}</h2>
        <p role="alert">{t.consentUnavailable}</p>
      </section>
    );

  return (
    <section className="registration" aria-labelledby="registration-title" style={{ '--brand-primary': payload.registrationFormConfig.branding.primaryColor, '--brand-accent': payload.registrationFormConfig.branding.accentColor, '--brand-primary-text': contrastColors.primaryForeground, '--brand-accent-text': contrastColors.accentForeground, '--brand-link': contrastColors.linkColor, '--brand-radius': payload.registrationFormConfig.branding.corners === 'rounded' ? '6px' : '0' } as CSSProperties}>
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
        <p className="registration-event-date">{payload.event.startsOn}</p>
        <h2 id="registration-title">{payload.event.name}</h2>
        {payload.registrationFormConfig.welcomeText && <p>{payload.registrationFormConfig.welcomeText}</p>}
      </header>
      {contrastColors.contrastNotice && <p className="registration-contrast-note" role="note">{locale === 'de' ? 'Schriftfarben werden automatisch für gute Lesbarkeit angepasst.' : 'Text colors are automatically adjusted for readability.'}</p>}
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
      <div className="registration-layout">
      <form ref={formRef} onSubmit={submit} noValidate={false}>
        <fieldset>
          <legend>{currentStep?.title[locale]}</legend>
          {currentStep?.fields.map((field) => {
            if (field.key === 'entries')
              return (
                <div key={field.key}>
                  {vehicles.map((item, index) => (
                    <fieldset className="vehicle-card" key={index}>
                      <legend>
                        {field.label[locale]} {index + 1}
                      </legend>
                      <label>
                        {t.class}
                        <select
                          required
                          value={item.classId}
                          onChange={(e) =>
                            setVehicle(index, { classId: e.target.value })
                          }
                        >
                          <option value="">—</option>
                          {payload.classes.map((option) => (
                            <option
                              key={option.id}
                              value={option.id}
                              disabled={
                                new Set(
                                  vehicles
                                    .map((entry) => entry.classId)
                                    .filter(Boolean),
                                ).size >=
                                  payload.registrationSettings
                                    .maximumClassesPerGroup &&
                                !vehicles.some(
                                  (entry, i) =>
                                    i !== index && entry.classId === option.id,
                                ) &&
                                item.classId !== option.id
                              }
                            >
                              {option.name} ({option.code})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.make}
                        <input
                          required
                          value={item.make}
                          onChange={(e) =>
                            setVehicle(index, { make: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t.model}
                        <input
                          required
                          value={item.model}
                          onChange={(e) =>
                            setVehicle(index, { model: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t.year}
                        <input
                          type="number"
                          min="1886"
                          max="2200"
                          value={item.year}
                          onChange={(e) =>
                            setVehicle(index, { year: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t.registration}
                        <input
                          value={item.registration}
                          onChange={(e) =>
                            setVehicle(index, { registration: e.target.value })
                          }
                        />
                      </label>
                      {vehicles.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setVehicles((old) =>
                              old.filter((_, i) => i !== index),
                            )
                          }
                        >
                          {t.remove}
                        </button>
                      )}
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setVehicles((old) => [
                        ...old,
                        {
                          classId: '',
                          make: '',
                          model: '',
                          year: '',
                          registration: '',
                        },
                      ])
                    }
                  >
                    {t.addVehicle}
                  </button>
                </div>
              );
            if (field.key === 'consent')
              return (
                <div key={field.key} className="consent-list">
                  {payload.consents
                    .filter((item) => item.language === locale)
                    .map((term) => (
                      <label
                        className="consent"
                        key={`${term.key}:${term.version}:${term.language}`}
                      >
                        <input
                          type="checkbox"
                          required
                          checked={
                            accepted[
                              `${term.key}:${term.version}:${term.language}`
                            ] ?? false
                          }
                          onChange={(e) =>
                            setAccepted((old) => ({
                              ...old,
                              [`${term.key}:${term.version}:${term.language}`]:
                                e.target.checked,
                            }))
                          }
                        />
                        <span>
                          {term.text} ({t.consent})
                        </span>
                      </label>
                    ))}
                </div>
              );
            const key = field.key as keyof typeof values;
            return (
              <label key={field.key}>
                {field.label[locale]}
                <input
                  type={field.type}
                  required={field.required}
                  value={values[key]}
                  onChange={(e) =>
                    setValues((old) => ({ ...old, [key]: e.target.value }))
                  }
                />
              </label>
            );
          })}
          {currentStep?.id === 'driver' && guardianRequired && (
            <div className="guardian-fields">
              <label>
                {t.guardianName}
                <input
                  required
                  value={values.guardianName}
                  onChange={(e) =>
                    setValues((old) => ({
                      ...old,
                      guardianName: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {t.guardianEmail}
                <input
                  type="email"
                  required
                  value={values.guardianEmail}
                  onChange={(e) =>
                    setValues((old) => ({
                      ...old,
                      guardianEmail: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
          )}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="registration-actions">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              {t.previous}
            </button>
          )}
          <button type="submit" disabled={submitting}>
            {submitting
              ? t.sending
              : step === steps.length - 1
                ? t.submit
                : t.next}
          </button>
        </div>
      </form>
      <aside className="registration-summary" aria-label={locale === 'de' ? 'Deine Nennung' : 'Your entry'}>
        <h3>{locale === 'de' ? 'Deine Nennung' : 'Your entry'}</h3>
        <p>{vehicles.length} {locale === 'de' ? 'Startmeldung(en)' : 'entry/entries'}</p>
        <p>{locale === 'de' ? 'Startgeld' : 'Entry fee'} · {vehicles.length} × —</p>
        <p>{locale === 'de' ? 'Nennungsschluss' : 'Deadline'} · —</p>
      </aside>
      </div>
      <footer className="registration-footer">{payload.event.name} · Nennung mit NENNBOX</footer>
    </section>
  );
}

export function RegistrationVerification({
  locale: localeValue,
}: {
  locale: string;
}) {
  const locale = localeValue.toLowerCase().startsWith('de') ? 'de' : 'en';
  const token = new URLSearchParams(location.search).get('token');
  const [message, setMessage] = useState(() =>
    token
      ? locale === 'de'
        ? 'E-Mail wird überprüft …'
        : 'Verifying email …'
      : locale === 'de'
        ? 'Der Bestätigungslink ist ungültig oder abgelaufen.'
        : 'This verification link is invalid or expired.',
  );
  useEffect(() => {
    if (!token) return;
    fetch('/public/registration/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => response.json())
      .then((result: { verified?: boolean }) =>
        setMessage(
          result.verified
            ? locale === 'de'
              ? 'E-Mail bestätigt. Die Nennung ist verifiziert.'
              : 'Email verified. Your registration is verified.'
            : locale === 'de'
              ? 'Der Bestätigungslink ist ungültig oder abgelaufen.'
              : 'This verification link is invalid or expired.',
        ),
      )
      .catch(() =>
        setMessage(
          locale === 'de'
            ? 'Verifikation momentan nicht möglich.'
            : 'Verification is temporarily unavailable.',
        ),
      );
  }, [locale, token]);
  return (
    <section aria-labelledby="verify-title">
      <h2 id="verify-title">
        {locale === 'de' ? 'E-Mail-Verifikation' : 'Email verification'}
      </h2>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
