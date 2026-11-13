import { Button, Checkbox } from '@racepilot/ui';
import { entryExtras } from './RegistrationDomain.js';
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
        <h3>{de ? 'Fahrer' : 'Driver'}</h3>
        <strong>{driverName}</strong>
        <p className="registration-review-detail">
          {[values.email, values.dateOfBirth, values.phone]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
        {guardianRequired && (
          <p className="registration-review-detail">
            {values.guardianName || '—'} · {values.guardianEmail || '—'}
          </p>
        )}
        {values.emergencyContactName && (
          <p className="registration-review-detail">
            {de ? 'Notfallkontakt' : 'Emergency contact'} ·{' '}
            {values.emergencyContactName}
            {values.emergencyContactPhone &&
              ` · ${values.emergencyContactPhone}`}
          </p>
        )}
        <Button type="button" variant="text" onClick={onEditDriver}>
          {de ? 'Ändern' : 'Edit'}
        </Button>
      </section>
      <section className="registration-review-card">
        <h3>
          {de ? 'Startmeldungen' : 'Entries'} · {vehicles.length}
        </h3>
        {vehicles.map((vehicle, index) => {
          const selectedClass = payload.classes.find(
            (item) => item.id === vehicle.classId,
          );
          const extras = entryExtras(payload, vehicle);
          return (
            <p
              className="registration-review-entry"
              key={`${vehicle.classId}:${index}`}
            >
              <strong>{vehicle.requestedStartNumber || index + 1}</strong> ·{' '}
              {[vehicle.make, vehicle.model, vehicle.year]
                .filter(Boolean)
                .join(' ') || '—'}{' '}
              · {selectedClass?.code ?? (de ? 'Klasse offen' : 'Class pending')}
              {extras.hasPassenger &&
                ` · ${de ? 'Beifahrer' : 'Co-driver'} ${vehicle.passengerFirstName} ${vehicle.passengerLastName}`}
              {extras.hasSpareVehicle &&
                ` · ${de ? 'Ersatzfahrzeug' : 'Spare'} ${[vehicle.spareVehicleMake, vehicle.spareVehicleModel].filter(Boolean).join(' ')}`}
            </p>
          );
        })}
        <p className="registration-review-detail">{model.estimateMessage}</p>
        <Button type="button" variant="text" onClick={onEditEntries}>
          {de ? 'Ändern' : 'Edit'}
        </Button>
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
                  aria-required="true"
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
