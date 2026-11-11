import { Checkbox, Field, Steps } from '@racepilot/ui';
import type { CSSProperties } from 'react';
import type { RegistrationModel } from './RegistrationModel.js';
import type { RegistrationActions } from './RegistrationActions.js';
import {
  RegistrationHeader,
  RegistrationSummary,
} from './RegistrationChrome.js';
import { RegistrationVehicleFields } from './RegistrationVehicleFields.js';
import { RegistrationCustomAnswers } from './RegistrationCustomAnswers.js';
import { RegistrationContactFields } from './RegistrationContactFields.js';
import { RegistrationReview } from './RegistrationReview.js';
import { RegistrationFooter } from './RegistrationFooter.js';
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
    steps,
    draftMessage,
  } = model;
  const { submit, uploadCustomField } = actions;
  const brandStyle: CSSProperties & Record<`--brand-${string}`, string> = {
    '--brand-primary': contrastColors.primarySurface,
    '--brand-accent': contrastColors.accentSurface,
    '--brand-primary-text': contrastColors.primaryForeground,
    '--brand-accent-text': contrastColors.accentForeground,
    '--brand-link': contrastColors.linkColor,
    '--brand-radius':
      payload.registrationFormConfig.branding.corners === 'rounded'
        ? '6px'
        : '0',
  };
  return (
    <section
      className="registration"
      aria-labelledby="registration-title"
      style={brandStyle}
    >
      <RegistrationHeader
        model={model}
        organizationId={organizationId}
        eventSlug={eventSlug}
      />
      {contrastColors.contrastNotice && (
        <p className="registration-contrast-note" role="note">
          {locale === 'de'
            ? 'Schriftfarben werden automatisch für gute Lesbarkeit angepasst.'
            : 'Text colors are automatically adjusted for readability.'}
        </p>
      )}
      <main className="registration-container">
        <Steps
          steps={steps.map((item) =>
            item.id === 'driver'
              ? locale === 'de'
                ? 'Fahrer'
                : 'Driver'
              : item.id === 'vehicles'
                ? locale === 'de'
                  ? 'Startmeldungen'
                  : 'Entries'
                : locale === 'de'
                  ? 'Prüfen und absenden'
                  : 'Review and submit',
          )}
          current={step}
          label={locale === 'de' ? 'Anmeldeschritte' : 'Registration steps'}
          completedLabel={locale === 'de' ? 'Abgeschlossen' : 'Completed'}
          variant="registration"
        />
        <div className="registration-layout">
          <form
            className="registration-form"
            id="registration-form"
            ref={formRef}
            onSubmit={submit}
            noValidate={false}
          >
            <fieldset>
              <legend>
                {step === steps.length - 1
                  ? locale === 'de'
                    ? 'Bitte prüfen'
                    : 'Please review'
                  : currentStep?.id === 'driver'
                    ? locale === 'de'
                      ? 'Fahrer'
                      : 'Driver'
                    : currentStep?.id === 'vehicles'
                      ? locale === 'de'
                        ? 'Startmeldungen'
                        : 'Entries'
                      : currentStep?.title[locale]}
              </legend>
              {step !== steps.length - 1 && currentStep?.id === 'vehicles' && (
                <p className="registration-step-description">
                  {locale === 'de'
                    ? 'Lege für jedes Fahrzeug eine Startmeldung an. Mehrere Starts sind möglich.'
                    : 'Create an entry for each vehicle. You can add multiple entries.'}
                </p>
              )}
              {step === steps.length - 1 ? (
                <RegistrationReview
                  model={model}
                  onEditDriver={() => setStep(0)}
                  onEditEntries={() => setStep(1)}
                />
              ) : (
                currentStep?.fields.map((field) => {
                  if (field.key === 'entries')
                    return (
                      <RegistrationVehicleFields
                        key={field.key}
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
                            <Checkbox
                              key={`${term.key}:${term.version}:${term.language}`}
                              label={`${term.required === false ? (locale === 'de' ? 'Freiwillig · ' : 'Optional · ') : locale === 'de' ? 'Erforderlich · ' : 'Required · '}${term.text} (${t.consent})`}
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
                          ))}
                      </div>
                    );
                  const key = field.key;
                  return (
                    <Field
                      key={field.key}
                      label={field.label[locale]}
                      type={field.type}
                      placeholder={
                        field.key === 'dateOfBirth' ? 'TT.MM.JJJJ' : undefined
                      }
                      hint={
                        field.key === 'email'
                          ? locale === 'de'
                            ? 'Bestätigungslink wird gesendet'
                            : 'A confirmation link will be sent'
                          : undefined
                      }
                      required={field.required}
                      value={driverFieldValue(values, key)}
                      onChange={(e) =>
                        setValues((old) =>
                          updateDriverField(old, key, e.target.value),
                        )
                      }
                    />
                  );
                })
              )}
              {currentStep?.id === 'driver' && (
                <RegistrationContactFields
                  config={payload.registrationFormConfig}
                  values={values}
                  onChange={(patch) =>
                    setValues((old) => ({ ...old, ...patch }))
                  }
                  t={t}
                />
              )}
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
                  <>
                    <Field
                      label={t.guardianName}
                      required
                      value={values.guardianName}
                      onChange={(e) =>
                        setValues((old) => ({
                          ...old,
                          guardianName: e.target.value,
                        }))
                      }
                    />
                    <Field
                      label={t.guardianEmail}
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
                  </>
                </div>
              )}
            </fieldset>
            {error && <p role="alert">{error}</p>}
            {draftMessage && <p role="status">{draftMessage}</p>}
            <RegistrationFooter model={model} actions={actions} />
          </form>
          <RegistrationSummary model={model} />
        </div>
      </main>
      <footer className="registration-site-footer">
        <span>{payload.organization.name}</span>
        <span>Nennung mit NENNBOX</span>
      </footer>
    </section>
  );
}

function driverFieldValue(
  values: RegistrationModel['values'],
  key: string,
): string {
  switch (key) {
    case 'firstName':
      return values.firstName;
    case 'lastName':
      return values.lastName;
    case 'email':
      return values.email;
    case 'dateOfBirth':
      return values.dateOfBirth;
    default:
      return '';
  }
}

function updateDriverField(
  values: RegistrationModel['values'],
  key: string,
  value: string,
): RegistrationModel['values'] {
  switch (key) {
    case 'firstName':
      return { ...values, firstName: value };
    case 'lastName':
      return { ...values, lastName: value };
    case 'email':
      return { ...values, email: value };
    case 'dateOfBirth':
      return { ...values, dateOfBirth: value };
    default:
      return values;
  }
}
