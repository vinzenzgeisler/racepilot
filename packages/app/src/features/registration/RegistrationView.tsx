import type { CSSProperties } from 'react';
import type { RegistrationModel } from './RegistrationModel.js';
import type { RegistrationActions } from './RegistrationActions.js';
import {
  RegistrationHeader,
  RegistrationSummary,
} from './RegistrationChrome.js';
import { RegistrationVehicleFields } from './RegistrationVehicleFields.js';
import { RegistrationCustomAnswers } from './RegistrationCustomAnswers.js';
export function RegistrationView({
  model,
  actions,
  organizationId,
  eventSlug,
}: {
  model: RegistrationModel;
  actions: RegistrationActions;
  organizationId: string;
  eventSlug: string;
}) {
  const {
    contrastColors,
    payload,
    formRef,
    currentStep,
    locale,
    vehicles,
    setVehicle,
    setVehicles,
    t,
    numberLookup,
    numberAvailability,
    setNumberAvailability,
    accepted,
    setAccepted,
    values,
    setValues,
    customAnswers,
    setCustomAnswers,
    uploadedNames,
    guardianRequired,
    error,
    step,
    setStep,
    submitting,
    steps,
    savingDraft,
    draftMessage,
  } = model;
  const { submit, saveDraft, uploadCustomField } = actions;
  return (
    <section
      className="registration"
      aria-labelledby="registration-title"
      style={
        {
          '--brand-primary': contrastColors.primarySurface,
          '--brand-accent': contrastColors.accentSurface,
          '--brand-primary-text': contrastColors.primaryForeground,
          '--brand-accent-text': contrastColors.accentForeground,
          '--brand-link': contrastColors.linkColor,
          '--brand-radius':
            payload.registrationFormConfig.branding.corners === 'rounded'
              ? '6px'
              : '0',
        } as CSSProperties
      }
    >
      <RegistrationHeader
        model={model}
        organizationId={organizationId}
        eventSlug={eventSlug}
      />
      <div className="registration-layout">
        <form ref={formRef} onSubmit={submit} noValidate={false}>
          <fieldset>
            <legend>{currentStep?.title[locale]}</legend>
            {currentStep?.fields.map((field) => {
              if (field.key === 'entries')
                return (
                  <RegistrationVehicleFields
                    field={field}
                    locale={locale}
                    vehicles={vehicles}
                    setVehicle={setVehicle}
                    setVehicles={setVehicles}
                    payload={payload}
                    t={t}
                    numberLookup={numberLookup}
                    numberAvailability={numberAvailability}
                    setNumberAvailability={setNumberAvailability}
                    organizationId={organizationId}
                    eventSlug={eventSlug}
                  />
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
                            required={term.required !== false}
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
                            {term.required === false
                              ? locale === 'de'
                                ? 'Freiwillig · '
                                : 'Optional · '
                              : locale === 'de'
                                ? 'Erforderlich · '
                                : 'Required · '}
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
            <RegistrationCustomAnswers
              isDriver={currentStep?.id === 'driver'}
              fields={payload.registrationFormConfig.customFields}
              locale={locale}
              customAnswers={customAnswers}
              setCustomAnswers={setCustomAnswers}
              uploadedNames={uploadedNames}
              uploadCustomField={uploadCustomField}
            />
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
            <button
              type="button"
              disabled={savingDraft}
              onClick={() => void saveDraft()}
            >
              {savingDraft
                ? t.sending
                : locale === 'de'
                  ? 'Zwischenspeichern'
                  : 'Save for later'}
            </button>
          </div>
          {draftMessage && <p role="status">{draftMessage}</p>}
        </form>
        <RegistrationSummary model={model} />
      </div>
      <footer className="registration-footer">
        {payload.event.name} · Nennung mit NENNBOX
      </footer>
    </section>
  );
}
