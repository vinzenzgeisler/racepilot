import { z } from 'zod';
import { PublicationPreferenceSchema } from './entries.js';

/** Empty input counts as "not given"; the form sends null, older clients may send "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
const phone = optionalText(40).refine(
  (value) => !value || /^\+?[0-9 ()\-./]{5,40}$/.test(value),
  { message: 'Invalid phone number' },
);
const postalCode = optionalText(20).refine(
  (value) => !value || /^[A-Za-z0-9][A-Za-z0-9 -]{1,19}$/.test(value),
  { message: 'Invalid postal code' },
);

/** Driver contact data of one registration. Which of them are asked is the form configuration's decision. */
export const registrationContactShape = {
  phone,
  street: optionalText(200),
  postalCode,
  city: optionalText(100),
  emergencyContactName: optionalText(200),
  emergencyContactPhone: phone,
  publicationPreference: PublicationPreferenceSchema.nullable().optional(),
};

/** Shared contact schema used by request validation and the public form step. */
export const RegistrationContactFieldsSchema = z
  .object(registrationContactShape)
  .superRefine((contact, context) => {
    const hasName = Boolean(contact.emergencyContactName);
    const hasPhone = Boolean(contact.emergencyContactPhone);
    if (hasName !== hasPhone) {
      context.addIssue({
        code: 'custom',
        path: [hasName ? 'emergencyContactPhone' : 'emergencyContactName'],
        message: 'Emergency contact name and phone must be provided together',
      });
    }
  });

/** Technical details of one reported vehicle. The type follows the class, it is not asked. */
export const registrationVehicleDetailsShape = {
  displacementCc: z.number().int().min(1).max(20000).nullable().optional(),
  cylinders: z.number().int().min(1).max(24).nullable().optional(),
  ownerName: optionalText(200),
  history: optionalText(4000),
};
