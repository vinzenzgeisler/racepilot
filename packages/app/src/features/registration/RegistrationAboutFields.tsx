import { FormGrid, FormSection } from '@racepilot/ui';
import type { RegistrationActions } from './RegistrationActions.js';
import type { RegistrationModel } from './RegistrationModel.js';
import { fieldState } from './RegistrationDomain.js';
import { RegistrationCustomAnswers } from './RegistrationCustomAnswers.js';
import { RegistrationPublicationField } from './RegistrationContactFields.js';

export function RegistrationAboutFields({
  model,
  actions,
}: {
  model: RegistrationModel;
  actions: RegistrationActions;
}) {
  const {
    payload,
    values,
    setValues,
    t,
    locale,
    customAnswers,
    setCustomAnswers,
    uploadedNames,
  } = model;
  const config = payload.registrationFormConfig;
  if (
    fieldState(config, 'publicationPreference') === 'hidden' &&
    config.customFields.length === 0
  )
    return null;
  return (
    <FormSection title={t.aboutYou} variant="registration">
      <FormGrid variant="registration">
        <RegistrationPublicationField
          config={config}
          values={values}
          onChange={(patch) => setValues((old) => ({ ...old, ...patch }))}
          t={t}
        />
        <RegistrationCustomAnswers
          fields={config.customFields}
          locale={locale}
          customAnswers={customAnswers}
          setCustomAnswers={setCustomAnswers}
          uploadedNames={uploadedNames}
          uploadCustomField={actions.uploadCustomField}
        />
      </FormGrid>
    </FormSection>
  );
}
