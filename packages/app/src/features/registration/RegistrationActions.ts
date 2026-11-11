import type { FormEvent } from 'react';
import {
  PublicRegistrationRequestSchema,
  RegistrationContactFieldsSchema,
  RegistrationDraftSchema,
} from '@racepilot/contracts';
import type { RegistrationModel } from './RegistrationModel.js';
import { fieldState, nullIfEmpty, numberOrNull } from './RegistrationDomain.js';

type Config = RegistrationModel['payload']['registrationFormConfig'];
/** A field the event no longer asks for is never sent, even if an older draft still holds a value. */
const asked = (config: Config, key: keyof Config['fields']) =>
  fieldState(config, key) !== 'hidden';
const contactPayload = (
  values: RegistrationModel['values'],
  config: Config,
) => ({
  phone: asked(config, 'phone') ? nullIfEmpty(values.phone) : null,
  street: asked(config, 'street') ? nullIfEmpty(values.street) : null,
  postalCode: asked(config, 'postalCode')
    ? nullIfEmpty(values.postalCode)
    : null,
  city: asked(config, 'city') ? nullIfEmpty(values.city) : null,
  emergencyContactName: asked(config, 'emergencyContact')
    ? nullIfEmpty(values.emergencyContactName)
    : null,
  emergencyContactPhone: asked(config, 'emergencyContact')
    ? nullIfEmpty(values.emergencyContactPhone)
    : null,
  publicationPreference: asked(config, 'publicationPreference')
    ? values.publicationPreference || null
    : null,
});

export function createRegistrationActions(
  model: RegistrationModel,
  organizationId: string,
  eventSlug: string,
) {
  const {
    step,
    steps,
    formRef,
    setStep,
    setError,
    payload,
    age,
    t,
    accepted,
    setSubmitting,
    submissionId,
    locale,
    values,
    guardianRequired,
    customAnswers,
    vehicles,
    setSubmitted,
    setDraftMessage,
    setSavingDraft,
    setCustomAnswers,
    setUploadedNames,
  } = model;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length - 1) {
      if (formRef.current && !formRef.current.reportValidity()) return;
      if (
        steps[step]?.id === 'driver' &&
        !RegistrationContactFieldsSchema.safeParse(
          contactPayload(values, payload!.registrationFormConfig),
        ).success
      ) {
        setError(t.retry);
        return;
      }
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
    if (
      payload!.consents
        .filter((item) => item.language === locale && item.required !== false)
        .some(
          (item) =>
            accepted[`${item.key}:${item.version}:${item.language}`] !== true,
        )
    ) {
      setError(
        locale === 'de'
          ? 'Bitte bestätige alle erforderlichen Bedingungen.'
          : 'Please accept all required terms.',
      );
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
        ...(asked(payload!.registrationFormConfig, 'country') && values.country
          ? { country: values.country }
          : {}),
        ...contactPayload(values, payload!.registrationFormConfig),
        ...(guardianRequired
          ? {
              guardianName: values.guardianName,
              guardianEmail: values.guardianEmail,
            }
          : {}),
      },
      customAnswers,
      entries: vehicles.map((item) => ({
        classId: item.classId,
        requestedStartNumber: item.requestedStartNumber || null,
        vehicle: {
          make: item.make,
          model: item.model,
          year: item.year ? Number(item.year) : null,
          registration: item.registration || null,
          displacementCc: asked(payload!.registrationFormConfig, 'displacement')
            ? numberOrNull(item.displacementCc)
            : null,
          cylinders: asked(payload!.registrationFormConfig, 'cylinders')
            ? numberOrNull(item.cylinders)
            : null,
          ownerName: asked(payload!.registrationFormConfig, 'owner')
            ? nullIfEmpty(item.ownerName)
            : null,
          history: asked(payload!.registrationFormConfig, 'history')
            ? nullIfEmpty(item.history)
            : null,
        },
      })),
      consents: payload!.consents
        .filter(
          (item) =>
            item.language === locale &&
            accepted[`${item.key}:${item.version}:${item.language}`] === true,
        )
        .map((item) => ({
          key: item.key,
          version: item.version,
          hash: item.hash,
          accepted: true as const,
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

  async function saveDraft() {
    const draft = RegistrationDraftSchema.safeParse({
      ...values,
      vehicles,
      accepted,
      customAnswers,
    });
    if (!draft.success || !values.email) {
      setDraftMessage(t.emailError);
      return;
    }
    setSavingDraft(true);
    setDraftMessage('');
    try {
      const response = await fetch(
        `/public/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/registration/drafts`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventSlug,
            language: locale,
            draft: draft.data,
          }),
        },
      );
      if (!response.ok) throw new Error();
      const savedAt = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());
      setDraftMessage(
        locale === 'de'
          ? `Entwurf gespeichert · ${savedAt}`
          : `Draft saved · ${savedAt}`,
      );
    } catch {
      setDraftMessage(t.retry);
    } finally {
      setSavingDraft(false);
    }
  }

  async function uploadCustomField(fieldKey: string, file: File) {
    const form = new FormData();
    form.set('file', file);
    try {
      const response = await fetch(
        `/public/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/registration/custom-fields/${encodeURIComponent(fieldKey)}/upload`,
        { method: 'POST', body: form },
      );
      if (!response.ok) throw new Error();
      const uploaded = (await response.json()) as {
        objectId: string;
        uploadToken: string;
      };
      setCustomAnswers((old) => ({ ...old, [fieldKey]: uploaded }));
      setUploadedNames((old) => ({ ...old, [fieldKey]: file.name }));
    } catch {
      setError(
        locale === 'de'
          ? 'Datei konnte nicht sicher hochgeladen werden.'
          : 'The file could not be uploaded safely.',
      );
    }
  }

  return { submit, saveDraft, uploadCustomField };
}
export type RegistrationActions = ReturnType<typeof createRegistrationActions>;
