import { z } from 'zod';
import { registrationContactShape } from './registration-details.js';
export { PassengerModeSchema, type PassengerMode } from './passenger-mode.js';


const name = z.string().trim().min(1).max(100);
const email = z.string().trim().email().max(254);

/** The co-driver as the driver names them; the co-driver completes the rest through a personal link. */
export const RegistrationPassengerSchema = z
  .object({
    firstName: name,
    lastName: name,
    email: email.nullable().optional(),
  })
  .strict();
export type RegistrationPassenger = z.infer<typeof RegistrationPassengerSchema>;

/** A second vehicle of an entry. It is no entry of its own and does not use class capacity. */
export const RegistrationSpareVehicleSchema = z
  .object({
    make: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    year: z.number().int().min(1886).max(2200).nullable(),
    registration: z.string().trim().max(64).nullable(),
  })
  .strict();
export type RegistrationSpareVehicle = z.infer<
  typeof RegistrationSpareVehicleSchema
>;

/** The office registers a co-driver afterwards; every detail beyond the name is optional. */
export const AdminPassengerCreateRequest = z
  .object({
    firstName: name,
    lastName: name,
    email: email.nullable().optional(),
    dateOfBirth: z.string().date().nullable().optional(),
  })
  .strict();
export type AdminPassengerCreateRequest = z.infer<
  typeof AdminPassengerCreateRequest
>;

/** Creates a personal link; names are needed only while the entry has no co-driver yet, an address only while none is known. */
export const AdminPassengerLinkRequest = z
  .object({
    firstName: name.optional(),
    lastName: name.optional(),
    email: email.nullable().optional(),
  })
  .strict();
export type AdminPassengerLinkRequest = z.infer<
  typeof AdminPassengerLinkRequest
>;

export const AdminPassengerLinkResponse = z
  .object({
    url: z.string().url(),
    expiresAt: z.string().datetime({ offset: true }),
    mailQueued: z.boolean(),
  })
  .strict();
export type AdminPassengerLinkResponse = z.infer<
  typeof AdminPassengerLinkResponse
>;

export const passengerTokenPattern = /^[A-Za-z0-9_-]{40,64}$/;
export const PassengerLinkResolveRequest = z
  .object({ token: z.string().regex(passengerTokenPattern) })
  .strict();

/** Everything the co-driver can see behind a link: their own record and the terms they accept. */
export const PassengerLinkViewSchema = z
  .object({
    eventName: z.string(),
    className: z.string(),
    driverName: z.string(),
    /** The language the driver registered in; the co-driver reads the terms in it. */
    language: z.enum(['de', 'en']),
    passenger: z
      .object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().nullable(),
        dateOfBirth: z.string().nullable(),
        country: z.string().nullable(),
        phone: z.string().nullable(),
        street: z.string().nullable(),
        postalCode: z.string().nullable(),
        city: z.string().nullable(),
        emergencyContactName: z.string().nullable(),
        emergencyContactPhone: z.string().nullable(),
      })
      .strict(),
    terms: z.array(
      z
        .object({
          key: z.string(),
          version: z.string(),
          language: z.enum(['de', 'en']),
          text: z.string(),
          hash: z.string(),
          required: z.boolean(),
        })
        .strict(),
    ),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type PassengerLinkView = z.infer<typeof PassengerLinkViewSchema>;

export const PassengerCompletionRequest = z
  .object({
    token: z.string().regex(passengerTokenPattern),
    language: z.enum(['de', 'en']),
    passenger: z
      .object({
        firstName: name,
        lastName: name,
        email: email.nullable().optional(),
        dateOfBirth: z.string().date(),
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .nullable()
          .optional(),
        phone: registrationContactShape.phone,
        street: registrationContactShape.street,
        postalCode: registrationContactShape.postalCode,
        city: registrationContactShape.city,
        emergencyContactName: registrationContactShape.emergencyContactName,
        emergencyContactPhone: registrationContactShape.emergencyContactPhone,
      })
      .strict(),
    consents: z
      .array(
        z
          .object({
            key: z.string().min(1).max(80),
            version: z.string().min(1).max(40),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
            accepted: z.literal(true),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export type PassengerCompletionRequest = z.infer<
  typeof PassengerCompletionRequest
>;
