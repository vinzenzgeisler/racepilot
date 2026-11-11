import type {
  RegistrationDetailsInput,
  VehicleDetailsInput,
} from './registration-fields.js';

export function mapRegistrationContactDetails(input: RegistrationDetailsInput) {
  return {
    phone: input.phone ?? null,
    street: input.street ?? null,
    postalCode: input.postalCode ?? null,
    city: input.city ?? null,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    publicationPreference: input.publicationPreference ?? null,
  };
}

export function mapRegistrationVehicleDetails(input: VehicleDetailsInput) {
  return {
    displacementCc: input.displacementCc ?? null,
    cylinders: input.cylinders ?? null,
    ownerName: input.ownerName ?? null,
    history: input.history ?? null,
  };
}
