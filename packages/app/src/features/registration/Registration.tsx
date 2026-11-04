import type { RegistrationDraft } from '@racepilot/contracts';
import { useRegistrationState } from './useRegistrationState.js';
import { deriveRegistration } from './RegistrationModel.js';
import { createRegistrationActions } from './RegistrationActions.js';
import { RegistrationView } from './RegistrationView.js';
export { estimateRegistrationTotal } from './RegistrationDomain.js';
export function Registration({
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
  const state = useRegistrationState({
    organizationId,
    eventSlug,
    defaultLocale,
    ...(initialDraft ? { initialDraft } : {}),
  });
  const { payload, loadError, t, submitted, locale } = state;
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
  const model = { ...state, ...deriveRegistration(state, payload), payload };
  const actions = createRegistrationActions(model, organizationId, eventSlug);
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
    <RegistrationView
      model={model}
      actions={actions}
      organizationId={organizationId}
      eventSlug={eventSlug}
    />
  );
}
