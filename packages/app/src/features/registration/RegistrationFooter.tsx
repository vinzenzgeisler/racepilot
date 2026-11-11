import { Button } from '@racepilot/ui';
import type { RegistrationActions } from './RegistrationActions.js';
import type { RegistrationModel } from './RegistrationModel.js';

export function RegistrationFooter({
  model,
  actions,
}: {
  model: RegistrationModel;
  actions: RegistrationActions;
}) {
  const { locale, step, steps, submitting, savingDraft, setStep, t } = model;
  const { saveDraft } = actions;
  return (
    <div className="registration-footer">
      <div className="registration-actions">
        {step > 0 && (
          <Button
            type="button"
            variant="text"
            onClick={() => setStep(step - 1)}
          >
            ← {t.previous}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={savingDraft}
          onClick={() => void saveDraft()}
        >
          {savingDraft
            ? t.sending
            : locale === 'de'
              ? 'Zwischenspeichern'
              : 'Save for later'}
        </Button>
        <Button type="submit" form="registration-form" disabled={submitting}>
          {submitting
            ? t.sending
            : step === steps.length - 1
              ? t.submit
              : step === steps.length - 2
                ? locale === 'de'
                  ? 'Weiter zur Prüfung'
                  : 'Continue to review'
                : locale === 'de'
                  ? 'Weiter zu Startmeldungen'
                  : 'Continue to entries'}
        </Button>
      </div>
    </div>
  );
}
