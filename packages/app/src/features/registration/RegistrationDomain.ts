import type {
  PassengerMode,
  StandardRegistrationForm,
  RegistrationSettings,
  RegistrationFormConfig,
} from '@racepilot/contracts';
export type FormPayload = {
  organization: { name: string; contactEmail: string | null };
  form: StandardRegistrationForm;
  event: {
    id: string;
    slug: string;
    name: string;
    startsOn: string;
    registrationClosesAt: string | null;
  };
  currency: string;
  pricing: Array<{
    classId: string;
    baseCents: number;
    additionalEntryAdjustmentCents: number;
    earlyBirdDeadline: string | null;
    earlyBirdDiscountCents: number;
  }>;
  classes: Array<{
    id: string;
    name: string;
    code: string;
    vehicleType: string;
    closed: boolean;
    passengerMode: PassengerMode;
  }>;
  consents: Array<{
    key: string;
    version: string;
    language: 'de' | 'en';
    text: string;
    hash: string;
    required?: boolean;
  }>;
  registrationSettings: RegistrationSettings;
  registrationFormConfig: RegistrationFormConfig;
};
export type VehicleEntry = {
  classId: string;
  make: string;
  model: string;
  year: string;
  registration: string;
  requestedStartNumber: string;
  displacementCc: string;
  cylinders: string;
  ownerName: string;
  history: string;
  passengerEnabled: boolean;
  passengerFirstName: string;
  passengerLastName: string;
  passengerEmail: string;
  spareVehicleEnabled: boolean;
  spareVehicleMake: string;
  spareVehicleModel: string;
  spareVehicleYear: string;
  spareVehicleRegistration: string;
};
export const emptyVehicle = (): VehicleEntry => ({
  classId: '',
  make: '',
  model: '',
  year: '',
  registration: '',
  requestedStartNumber: '',
  displacementCc: '',
  cylinders: '',
  ownerName: '',
  history: '',
  passengerEnabled: false,
  passengerFirstName: '',
  passengerLastName: '',
  passengerEmail: '',
  spareVehicleEnabled: false,
  spareVehicleMake: '',
  spareVehicleModel: '',
  spareVehicleYear: '',
  spareVehicleRegistration: '',
});
export type DriverContact = {
  phone: string;
  country: string;
  street: string;
  postalCode: string;
  city: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  publicationPreference: '' | 'name_visible' | 'initials' | 'hidden';
};
export type FieldState = 'required' | 'optional' | 'hidden';
/** The state the organization or event configured for a standard field. */
export const fieldState = (
  config: RegistrationFormConfig,
  key: keyof RegistrationFormConfig['fields'],
): FieldState => config.fields[key].state;
export const nullIfEmpty = (value: string) => value.trim() || null;
export const numberOrNull = (value: string) =>
  value.trim() ? Number(value) : null;
type PublicPriceRule = FormPayload['pricing'][number];
export function estimateRegistrationTotal(
  vehicles: Array<{ classId: string }>,
  rules: PublicPriceRule[],
  at = new Date(),
): number | null {
  if (!vehicles.length || vehicles.some((vehicle) => !vehicle.classId))
    return null;
  const byClass = new Map(rules.map((rule) => [rule.classId, rule]));
  const counts = new Map<string, number>();
  for (const vehicle of vehicles)
    counts.set(vehicle.classId, (counts.get(vehicle.classId) ?? 0) + 1);
  if ([...counts.keys()].some((classId) => !byClass.has(classId))) return null;
  let total = 0;
  for (const [classId, quantity] of counts) {
    const rule = byClass.get(classId)!;
    const early =
      rule.earlyBirdDeadline &&
      at.getTime() <= Date.parse(rule.earlyBirdDeadline)
        ? rule.earlyBirdDiscountCents
        : 0;
    const lineTotal = Math.max(
      0,
      rule.baseCents * quantity +
        rule.additionalEntryAdjustmentCents * (quantity - 1) -
        early * quantity,
    );
    if (!Number.isSafeInteger(lineTotal)) return null;
    total += lineTotal;
  }
  return Number.isSafeInteger(total) ? total : null;
}
export { translations } from './registrationTranslations.js';

/** What a start entry may add: a co-driver where the class takes one, a spare vehicle where the event offers it. */
export function vehicleExtras(
  payload: Pick<FormPayload, 'classes' | 'registrationFormConfig'>,
  classId: string,
) {
  const mode: PassengerMode = payload.registrationFormConfig.features.passenger
    ? (payload.classes.find((item) => item.id === classId)?.passengerMode ??
      'none')
    : 'none';
  return {
    passengerMode: mode,
    spareVehicle: payload.registrationFormConfig.features.spareVehicle,
  };
}

export function getAge(dob: string, on: string): number {
  if (!dob || !on) return 100;
  const birth = new Date(`${dob}T00:00:00Z`);
  const date = new Date(`${on}T00:00:00Z`);
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() &&
      date.getUTCDate() < birth.getUTCDate())
  )
    age--;
  return age;
}

/** What one start entry actually carries: the class decides on the co-driver, the event on the spare vehicle. */
export function entryExtras(
  payload: Pick<FormPayload, 'classes' | 'registrationFormConfig'>,
  vehicle: VehicleEntry,
) {
  const extras = vehicleExtras(payload, vehicle.classId);
  return {
    ...extras,
    hasPassenger:
      extras.passengerMode === 'required' ||
      (extras.passengerMode === 'optional' && vehicle.passengerEnabled),
    hasSpareVehicle: extras.spareVehicle && vehicle.spareVehicleEnabled,
  };
}
