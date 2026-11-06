import { z } from 'zod';
import { PublicationPreferenceSchema } from './entries.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();
export const EntryDriverUpdateRequest = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    dateOfBirth: z.string().date().nullable(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    phone: optionalText(40),
    street: optionalText(200),
    postalCode: optionalText(20),
    city: optionalText(100),
    emergencyContactName: optionalText(200),
    emergencyContactPhone: optionalText(40),
    publicationPreference: PublicationPreferenceSchema.nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
export const EntryVehicleUpdateRequest = z
  .object({
    make: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    year: z.number().int().min(1886).max(2200).nullable(),
    registration: optionalText(64),
    displacementCc: z.number().int().min(1).max(20000).nullable(),
    cylinders: z.number().int().min(1).max(24).nullable(),
    ownerName: optionalText(200),
    history: optionalText(4000),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
export type EntryDriverUpdateRequest = z.infer<typeof EntryDriverUpdateRequest>;
export type EntryVehicleUpdateRequest = z.infer<
  typeof EntryVehicleUpdateRequest
>;
export const EntryMessagesResponse = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string().uuid(),
          status: z.enum(['pending', 'sending', 'sent', 'failed']),
          subject: z.string(),
          templateKey: z.string(),
          recipient: z.string(),
          createdAt: z.string().datetime({ offset: true }),
          sentAt: z.string().datetime({ offset: true }).nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type EntryMessagesResponse = z.infer<typeof EntryMessagesResponse>;
