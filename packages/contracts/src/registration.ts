import { z } from 'zod';
import { RegistrationCustomFieldAnswersSchema } from './registration-config.js';
import {
  RegistrationContactFieldsSchema,
  registrationVehicleDetailsShape,
} from './registration-details.js';

export const StandardRegistrationFormSchema = z
  .object({
    version: z.literal('1.0'),
    steps: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.object({ de: z.string(), en: z.string() }).strict(),
          fields: z.array(
            z
              .object({
                key: z.string().min(1),
                type: z.enum([
                  'text',
                  'email',
                  'date',
                  'checkbox',
                  'select',
                  'entries',
                ]),
                required: z.boolean(),
                label: z.object({ de: z.string(), en: z.string() }).strict(),
                options: z
                  .array(
                    z
                      .object({
                        value: z.string(),
                        label: z
                          .object({ de: z.string(), en: z.string() })
                          .strict(),
                      })
                      .strict(),
                  )
                  .optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type StandardRegistrationForm = z.infer<
  typeof StandardRegistrationFormSchema
>;
export const RegistrationSettingsSchema = z
  .object({
    sharedContactEmail: z.enum(['allowed', 'disallowed']).default('allowed'),
    minimumAge: z.number().int().min(0).max(100).nullable().default(null),
    guardianRequiredBelowAge: z.number().int().min(0).max(100).default(18),
    maximumClassesPerGroup: z.number().int().min(1).max(100).default(8),
  })
  .strict();
export type RegistrationSettings = z.infer<typeof RegistrationSettingsSchema>;
const registrationRateLimitValue = z.number().int().min(1).max(100_000);
const registrationRateLimitWindow = z.number().int().min(1).max(86_400);
export const OrganizationPublicRegistrationRateLimitOverridesSchema = z
  .object({
    organizationLimit: registrationRateLimitValue.optional(),
    eventLimit: registrationRateLimitValue.optional(),
    windowSeconds: registrationRateLimitWindow.optional(),
  })
  .strict();
export type OrganizationPublicRegistrationRateLimitOverrides = z.infer<
  typeof OrganizationPublicRegistrationRateLimitOverridesSchema
>;
export const EventPublicRegistrationRateLimitOverridesSchema = z
  .object({
    eventLimit: registrationRateLimitValue.optional(),
    windowSeconds: registrationRateLimitWindow.optional(),
  })
  .strict();
export type EventPublicRegistrationRateLimitOverrides = z.infer<
  typeof EventPublicRegistrationRateLimitOverridesSchema
>;
export const PublicRegistrationRequestSchema = z
  .object({
    submissionId: z.string().uuid(),
    formVersion: z.literal('1.0'),
    language: z.enum(['de', 'en']),
    eventSlug: z.string().trim().min(1).max(100),
    person: RegistrationContactFieldsSchema.extend({
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      email: z.string().email().max(254),
      dateOfBirth: z.string().date(),
      country: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .optional(),
      guardianName: z.string().trim().min(1).max(200).optional(),
      guardianEmail: z.string().email().max(254).optional(),
    }).strict(),
    customAnswers: RegistrationCustomFieldAnswersSchema.optional(),
    entries: z
      .array(
        z
          .object({
            classId: z.string().uuid(),
            requestedStartNumber: z
              .string()
              .trim()
              .max(64)
              .nullable()
              .optional(),
            vehicle: z
              .object({
                make: z.string().trim().min(1).max(100),
                model: z.string().trim().min(1).max(100),
                year: z.number().int().min(1886).max(2200).nullable(),
                registration: z.string().trim().max(64).nullable(),
                ...registrationVehicleDetailsShape,
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
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
      .min(1)
      .max(30),
  })
  .strict();
export type PublicRegistrationRequest = z.infer<
  typeof PublicRegistrationRequestSchema
>;
export const RegistrationDraftSchema = z
  .object({
    firstName: z.string().max(100),
    lastName: z.string().max(100),
    email: z.string().email().max(254),
    dateOfBirth: z.string().max(10),
    country: z.string().max(2).optional(),
    guardianName: z.string().max(200),
    guardianEmail: z.string().max(254),
    // Added later: drafts saved before these fields existed still resume.
    phone: z.string().max(40).default(''),
    street: z.string().max(200).default(''),
    postalCode: z.string().max(20).default(''),
    city: z.string().max(100).default(''),
    emergencyContactName: z.string().max(200).default(''),
    emergencyContactPhone: z.string().max(40).default(''),
    publicationPreference: z
      .enum(['name_visible', 'initials', 'hidden', ''])
      .default(''),
    vehicles: z
      .array(
        z
          .object({
            classId: z.string().uuid().or(z.literal('')),
            make: z.string().max(100),
            model: z.string().max(100),
            year: z.string().max(4),
            registration: z.string().max(64),
            requestedStartNumber: z.string().max(64),
            displacementCc: z.string().max(5).default(''),
            cylinders: z.string().max(2).default(''),
            ownerName: z.string().max(200).default(''),
            history: z.string().max(4000).default(''),
          })
          .strict(),
      )
      .max(8),
    accepted: z.record(z.string().max(120), z.boolean()),
    customAnswers: RegistrationCustomFieldAnswersSchema.default({}),
  })
  .strict();
export type RegistrationDraft = z.infer<typeof RegistrationDraftSchema>;
export const SaveRegistrationDraftRequestSchema = z
  .object({
    eventSlug: z.string().trim().min(1).max(100),
    language: z.enum(['de', 'en']),
    draft: RegistrationDraftSchema,
  })
  .strict();
export const ResumeRegistrationRequestSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/) })
  .strict();
export const standardRegistrationForm: StandardRegistrationForm = {
  version: '1.0',
  steps: [
    {
      id: 'driver',
      title: { de: 'Fahrerdaten', en: 'Driver details' },
      fields: [
        {
          key: 'firstName',
          type: 'text',
          required: true,
          label: { de: 'Vorname', en: 'First name' },
        },
        {
          key: 'lastName',
          type: 'text',
          required: true,
          label: { de: 'Nachname', en: 'Last name' },
        },
        {
          key: 'email',
          type: 'email',
          required: true,
          label: { de: 'Kontakt-E-Mail', en: 'Contact email' },
        },
        {
          key: 'dateOfBirth',
          type: 'date',
          required: true,
          label: { de: 'Geburtsdatum', en: 'Date of birth' },
        },
      ],
    },
    {
      id: 'vehicles',
      title: { de: 'Fahrzeuge und Klassen', en: 'Vehicles and classes' },
      fields: [
        {
          key: 'entries',
          type: 'entries',
          required: true,
          label: { de: 'Fahrzeug und Klasse', en: 'Vehicle and class' },
        },
      ],
    },
    {
      id: 'consent',
      title: { de: 'Einwilligungen', en: 'Consents' },
      fields: [
        {
          key: 'consent',
          type: 'checkbox',
          required: true,
          label: {
            de: 'Ich akzeptiere die bereitgestellten Teilnahmebedingungen.',
            en: 'I accept the provided participation terms.',
          },
        },
      ],
    },
  ],
};
