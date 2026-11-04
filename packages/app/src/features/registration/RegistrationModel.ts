import { deriveAccessibleBrandColors } from '@racepilot/contracts';
import {
  estimateRegistrationTotal,
  getAge,
  type FormPayload,
  type VehicleEntry,
} from './RegistrationDomain.js';
import type { RegistrationState } from './useRegistrationState.js';
export function deriveRegistration(
  state: RegistrationState,
  payload: FormPayload,
) {
  const { step, values, locale, vehicles, setVehicles } = state;
  const steps = payload.form.steps;
  const currentStep = steps[step];
  const contrastColors = deriveAccessibleBrandColors(
    payload.registrationFormConfig.branding.primaryColor,
    payload.registrationFormConfig.branding.accentColor,
  );
  const age = getAge(values.dateOfBirth, payload.event.startsOn);
  const guardianRequired =
    age < payload.registrationSettings.guardianRequiredBelowAge;
  const estimatedTotal = estimateRegistrationTotal(vehicles, payload.pricing);
  const registrationCloseDate = payload.event.registrationClosesAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(payload.event.registrationClosesAt))
    : null;
  const formattedTotal =
    estimatedTotal === null
      ? null
      : new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: payload.currency,
        }).format(estimatedTotal / 100);
  const estimateMessage =
    formattedTotal ??
    (vehicles.some((vehicle) => !vehicle.classId)
      ? locale === 'de'
        ? 'Klasse auswählen'
        : 'Select a class'
      : payload.pricing.length === 0
        ? locale === 'de'
          ? 'Kein Startgeld hinterlegt'
          : 'No entry fee configured'
        : locale === 'de'
          ? 'Preis für Auswahl nicht verfügbar'
          : 'Price unavailable for selection');
  const setVehicle = (index: number, patch: Partial<VehicleEntry>) =>
    setVehicles((old) =>
      old.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  return {
    steps,
    currentStep,
    contrastColors,
    age,
    guardianRequired,
    registrationCloseDate,
    estimateMessage,
    setVehicle,
  };
}
export type RegistrationModel = Omit<RegistrationState, 'payload'> & {
  payload: FormPayload;
} & ReturnType<typeof deriveRegistration>;
