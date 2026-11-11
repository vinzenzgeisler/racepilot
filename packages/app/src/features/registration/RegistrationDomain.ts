import type {
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
});
export type DriverContact = {
  phone: string;
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
export const translations = {
  de: {
    loading: 'Anmeldeformular wird geladen …',
    loadError: 'Das Formular ist momentan nicht verfügbar.',
    previous: 'Zurück',
    next: 'Weiter',
    submit: 'Nennung absenden',
    sending: 'Wird gesendet …',
    retry: 'Bitte prüfe deine Angaben und versuche es erneut.',
    minAge: 'Das Mindestalter dieser Organisation ist noch nicht erreicht.',
    consentUnavailable:
      'Die Anmeldung ist nicht verfügbar, weil für diese Veranstaltung kein Einwilligungstext hinterlegt ist.',
    submitted:
      'Die Nennung wurde angenommen. Bitte bestätige die E-Mail-Adresse über den zugesandten Link.',
    guardianName: 'Name der erziehungsberechtigten Person',
    guardianEmail: 'E-Mail der erziehungsberechtigten Person',
    addVehicle: 'Weiteres Fahrzeug hinzufügen',
    remove: 'Entfernen',
    class: 'Klasse',
    make: 'Hersteller',
    model: 'Modell',
    year: 'Baujahr',
    registration: 'Kennzeichen',
    consent: 'Ich stimme zu',
    emailError: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    phone: 'Telefon',
    street: 'Straße und Hausnummer',
    postalCode: 'PLZ',
    city: 'Ort',
    address: 'Adresse',
    emergencyContact: 'Notfallkontakt',
    emergencyContactName: 'Name',
    emergencyContactPhone: 'Telefon',
    publicationPreference: 'Veröffentlichung',
    publicationNotGiven: 'Keine Angabe',
    publicationNameVisible: 'Name sichtbar',
    publicationInitials: 'Nur Initialen',
    publicationHidden: 'Nicht veröffentlichen',
    displacement: 'Hubraum (cm³)',
    cylinders: 'Zylinder',
    owner: 'Besitzer',
    history: 'Fahrzeughistorie',
  },
  en: {
    loading: 'Loading registration form …',
    loadError: 'The form is currently unavailable.',
    previous: 'Back',
    next: 'Continue',
    submit: 'Submit registration',
    sending: 'Sending …',
    retry: 'Check your details and try again.',
    minAge:
      'The driver does not meet the organization’s minimum age requirement.',
    consentUnavailable:
      'Registration is not available because this event has no published consent text.',
    submitted:
      'Your registration was accepted. Please verify your email using the link we sent.',
    guardianName: 'Parent or guardian name',
    guardianEmail: 'Parent or guardian email',
    addVehicle: 'Add another vehicle',
    remove: 'Remove',
    class: 'Class',
    make: 'Make',
    model: 'Model',
    year: 'Year',
    registration: 'Registration',
    consent: 'I agree',
    emailError: 'Enter a valid email address.',
    phone: 'Phone',
    street: 'Street and number',
    postalCode: 'Postal code',
    city: 'City',
    address: 'Address',
    emergencyContact: 'Emergency contact',
    emergencyContactName: 'Name',
    emergencyContactPhone: 'Phone',
    publicationPreference: 'Publication',
    publicationNotGiven: 'No preference',
    publicationNameVisible: 'Name visible',
    publicationInitials: 'Initials only',
    publicationHidden: 'Do not publish',
    displacement: 'Displacement (cc)',
    cylinders: 'Cylinders',
    owner: 'Owner',
    history: 'Vehicle history',
  },
} as const;

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
