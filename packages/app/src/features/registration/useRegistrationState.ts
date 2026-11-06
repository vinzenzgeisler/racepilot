import { useEffect, useRef, useState } from 'react';
import {
  StandardRegistrationFormSchema,
  RegistrationFormConfigSchema,
  defaultRegistrationFormConfig,
  type RegistrationDraft,
} from '@racepilot/contracts';
import {
  emptyVehicle,
  translations,
  type FormPayload,
  type VehicleEntry,
} from './RegistrationDomain.js';
export function useRegistrationState({
  organizationId,
  eventSlug,
  defaultLocale,
  initialDraft,
}: {
  organizationId: string;
  eventSlug: string;
  defaultLocale: string;
  initialDraft?: RegistrationDraft;
}) {
  const [locale, setLocale] = useState<'de' | 'en'>(
    defaultLocale.toLowerCase().startsWith('de') ? 'de' : 'en',
  );
  const t = translations[locale];
  const [payload, setPayload] = useState<FormPayload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({
    firstName: initialDraft?.firstName ?? '',
    lastName: initialDraft?.lastName ?? '',
    email: initialDraft?.email ?? '',
    dateOfBirth: initialDraft?.dateOfBirth ?? '',
    guardianName: initialDraft?.guardianName ?? '',
    guardianEmail: initialDraft?.guardianEmail ?? '',
    phone: initialDraft?.phone ?? '',
    street: initialDraft?.street ?? '',
    postalCode: initialDraft?.postalCode ?? '',
    city: initialDraft?.city ?? '',
    emergencyContactName: initialDraft?.emergencyContactName ?? '',
    emergencyContactPhone: initialDraft?.emergencyContactPhone ?? '',
    publicationPreference: initialDraft?.publicationPreference ?? '',
  });
  const [vehicles, setVehicles] = useState<VehicleEntry[]>(
    initialDraft?.vehicles ?? [emptyVehicle()],
  );
  const [accepted, setAccepted] = useState<Record<string, boolean>>(
    initialDraft?.accepted ?? {},
  );
  const [customAnswers, setCustomAnswers] = useState<
    Record<string, string | boolean | { objectId: string; uploadToken: string }>
  >(initialDraft?.customAnswers ?? {});
  const [uploadedNames, setUploadedNames] = useState<Record<string, string>>(
    {},
  );
  const [submissionId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [numberAvailability, setNumberAvailability] = useState<
    Record<number, boolean | null>
  >({});
  const numberLookup = useRef<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
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
        const registrationFormConfig = RegistrationFormConfigSchema.parse(
          value.registrationFormConfig ?? defaultRegistrationFormConfig,
        );
        if (alive) setPayload({ ...value, form, registrationFormConfig });
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [organizationId, eventSlug]);

  return {
    locale,
    setLocale,
    t,
    payload,
    loadError,
    step,
    setStep,
    values,
    setValues,
    vehicles,
    setVehicles,
    accepted,
    setAccepted,
    customAnswers,
    setCustomAnswers,
    uploadedNames,
    setUploadedNames,
    submissionId,
    submitting,
    setSubmitting,
    error,
    setError,
    numberAvailability,
    setNumberAvailability,
    numberLookup,
    submitted,
    setSubmitted,
    savingDraft,
    setSavingDraft,
    draftMessage,
    setDraftMessage,
    formRef,
  };
}
export type RegistrationState = ReturnType<typeof useRegistrationState>;
