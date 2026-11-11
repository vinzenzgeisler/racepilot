import { Button, Checkbox } from '@racepilot/ui';
import type { RegistrationModel } from './RegistrationModel.js';

export function RegistrationReview({
  model,
  onEditDriver,
  onEditEntries,
}: {
  model: RegistrationModel;
  onEditDriver: () => void;
  onEditEntries: () => void;
}) {
  const { locale, values, vehicles, payload, guardianRequired } = model;
  const de = locale === 'de';
  const driverName =
    [values.firstName, values.lastName].filter(Boolean).join(' ') || '—';
  const consents = payload.consents.filter((item) => item.language === locale);
  const requiredConsents = consents.filter((item) => item.required !== false);
  const optionalConsents = consents.filter((item) => item.required === false);
  return (
    <div className="registration-review">
      <section className="registration-review-card">
        <header>
          <h3>{de ? 'Fahrer' : 'Driver'}</h3>
          <Button type="button" variant="text" onClick={onEditDriver}>
            {de ? 'Ändern' : 'Edit'}
          </Button>
        </header>
        <p>{driverName}</p>
        <p>{values.email || '—'}</p>
        {values.dateOfBirth && <p>{values.dateOfBirth}</p>}
        {values.phone && <p>{values.phone}</p>}
        {guardianRequired && (
          <p>
            {values.guardianName || '—'} · {values.guardianEmail || '—'}
          </p>
        )}
      </section>
      <section className="registration-review-card">
        <header>
          <h3>{de ? 'Startmeldungen' : 'Entries'}</h3>
          <Button type="button" variant="text" onClick={onEditEntries}>
            {de ? 'Ändern' : 'Edit'}
          </Button>
        </header>
        {vehicles.map((vehicle, index) => {
          const selectedClass = payload.classes.find(
            (item) => item.id === vehicle.classId,
          );
          return (
            <div
              className="registration-review-entry"
              key={`${vehicle.classId}:${index}`}
            >
              <p>
                <strong>
                  {selectedClass?.name ??
                    (de ? 'Klasse nicht gewählt' : 'Class not selected')}
                </strong>
              </p>
              <p>
                {[vehicle.make, vehicle.model, vehicle.year]
                  .filter(Boolean)
                  .join(' ') || '—'}
              </p>
              {vehicle.registration && (
                <p>
                  {de ? 'Kennzeichen' : 'Registration'}: {vehicle.registration}
                </p>
              )}
              {vehicle.requestedStartNumber && (
                <p>
                  {de ? 'Wunsch-Startnummer' : 'Requested number'}:{' '}
                  {vehicle.requestedStartNumber}
                </p>
              )}
            </div>
          );
        })}
        <p>
          {de ? 'Voraussichtliches Startgeld' : 'Estimated entry fee'}:{' '}
          {model.estimateMessage}
        </p>
      </section>
      {payload.registrationFormConfig.organizerNotice && (
        <section className="registration-review-card registration-review-wide">
          <h3>{de ? 'Hinweise des Veranstalters' : 'Organizer notes'}</h3>
          <p className="registration-organizer-notice">
            {payload.registrationFormConfig.organizerNotice}
          </p>
        </section>
      )}
      <section className="registration-review-card registration-review-consents registration-review-wide">
        <h3>{de ? 'Bestätigungen' : 'Confirmations'}</h3>
        <div className="consent-list">
          {requiredConsents.length > 0 && (
            <section>
              <h4>{de ? 'Erforderlich' : 'Required'}</h4>
              {requiredConsents.map((term) => (
                <Checkbox
                  key={`${term.key}:${term.version}:${term.language}`}
                  label={term.text}
                  required
                  checked={
                    model.accepted[
                      `${term.key}:${term.version}:${term.language}`
                    ] ?? false
                  }
                  onChange={(event) =>
                    model.setAccepted((old) => ({
                      ...old,
                      [`${term.key}:${term.version}:${term.language}`]:
                        event.target.checked,
                    }))
                  }
                />
              ))}
            </section>
          )}
          {optionalConsents.length > 0 && (
            <section>
              <h4>{de ? 'Freiwillig' : 'Optional'}</h4>
              {optionalConsents.map((term) => (
                <Checkbox
                  key={`${term.key}:${term.version}:${term.language}`}
                  label={term.text}
                  checked={
                    model.accepted[
                      `${term.key}:${term.version}:${term.language}`
                    ] ?? false
                  }
                  onChange={(event) =>
                    model.setAccepted((old) => ({
                      ...old,
                      [`${term.key}:${term.version}:${term.language}`]:
                        event.target.checked,
                    }))
                  }
                />
              ))}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
