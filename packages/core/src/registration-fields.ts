/**
 * Standard registration fields whose presence the organization or the event decides.
 * Shared by the delivered form and the server-side check, so what the form asks for and
 * what the server accepts cannot drift apart.
 */
export type RegistrationFieldState = 'required' | 'optional' | 'hidden';

export const registrationDetailFieldKeys = [
  'phone',
  'street',
  'postalCode',
  'city',
  'emergencyContact',
  'publicationPreference',
  'displacement',
  'cylinders',
  'owner',
  'history',
] as const;
export type RegistrationDetailFieldKey =
  (typeof registrationDetailFieldKeys)[number];
export type RegistrationFieldStates = Record<
  RegistrationDetailFieldKey,
  RegistrationFieldState
>;

type StoredConfig = { fields?: unknown } | null | undefined;
const isState = (value: unknown): value is RegistrationFieldState =>
  value === 'required' || value === 'optional' || value === 'hidden';

/** A key missing from an older stored configuration means the default: optional. */
export function resolveRegistrationFieldStates(
  organization: StoredConfig,
  event: StoredConfig,
): RegistrationFieldStates {
  const read = (config: StoredConfig, key: string) => {
    const fields = config?.fields;
    if (!fields || typeof fields !== 'object') return undefined;
    const state = (fields as Record<string, { state?: unknown } | undefined>)[
      key
    ]?.state;
    return isState(state) ? state : undefined;
  };
  return Object.fromEntries(
    registrationDetailFieldKeys.map((key) => [
      key,
      read(event, key) ?? read(organization, key) ?? 'optional',
    ]),
  ) as RegistrationFieldStates;
}

export interface RegistrationDetailsInput {
  phone?: string | null | undefined;
  street?: string | null | undefined;
  postalCode?: string | null | undefined;
  city?: string | null | undefined;
  emergencyContactName?: string | null | undefined;
  emergencyContactPhone?: string | null | undefined;
  publicationPreference?: string | null | undefined;
}
export interface VehicleDetailsInput {
  displacementCc?: number | null | undefined;
  cylinders?: number | null | undefined;
  ownerName?: string | null | undefined;
  history?: string | null | undefined;
}

const present = (value: unknown) =>
  value !== null && value !== undefined && value !== '';

function check(
  state: RegistrationFieldState,
  values: unknown[],
  all: boolean,
): boolean {
  const given = values.map(present);
  if (state === 'hidden') return !given.some(Boolean);
  if (state === 'required') return given.every(Boolean);
  // Optional parts that belong together are given together or not at all.
  return all ? given.every(Boolean) || !given.some(Boolean) : true;
}

/** Whether the contact data fits the configured states: hidden stays empty, required is given. */
export function registrationContactMatches(
  input: RegistrationDetailsInput,
  states: RegistrationFieldStates,
): boolean {
  return (
    check(states.phone, [input.phone], false) &&
    check(states.street, [input.street], false) &&
    check(states.postalCode, [input.postalCode], false) &&
    check(states.city, [input.city], false) &&
    check(
      states.emergencyContact,
      [input.emergencyContactName, input.emergencyContactPhone],
      true,
    ) &&
    check(states.publicationPreference, [input.publicationPreference], false)
  );
}

export function registrationVehicleDetailsMatch(
  input: VehicleDetailsInput,
  states: RegistrationFieldStates,
): boolean {
  return (
    check(states.displacement, [input.displacementCc], false) &&
    check(states.cylinders, [input.cylinders], false) &&
    check(states.owner, [input.ownerName], false) &&
    check(states.history, [input.history], false)
  );
}
