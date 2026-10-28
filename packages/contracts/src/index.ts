import { z } from 'zod';
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
const safeRuntimeUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      return ['https:', 'http:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  });
const hexColor = z.string().regex(/^#[\da-fA-F]{6}$/);
const luminance = (color: string) => {
  const channels =
    color
      .slice(1)
      .match(/../g)
      ?.map((channel) => parseInt(channel, 16) / 255) ?? [];
  const [r, g, b] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const primaryColor = hexColor.refine(
  (color) => 1.05 / (luminance(color) + 0.05) >= 4.5,
);
const brandAccentColor = hexColor.refine(
  (color) => 1.05 / (luminance(color) + 0.05) >= 3,
);
export const RuntimeBootstrapResponse = z
  .object({
    schemaVersion: z.literal(1),
    configurationVersion: z.string().min(1),
    deploymentMode: z.enum(['community', 'cloud']),
    organization: z
      .object({
        id: z.string().uuid(),
        slug: z.string().min(1),
        name: z.string().min(1),
      })
      .strict(),
    branding: z
      .object({
        logoUrl: safeRuntimeUrl.nullable(),
        primaryColor,
        accentColor: brandAccentColor,
        contactEmail: z.string().email().nullable(),
        eventImageUrl: safeRuntimeUrl.nullable(),
      })
      .strict(),
    locale: z.string().min(1),
    activeEvent: z
      .object({ id: z.string().uuid(), slug: z.string(), name: z.string() })
      .strict()
      .nullable(),
    capabilities: z.array(z.string()).max(100),
    legalLinks: z
      .array(
        z.object({ label: z.string().min(1), href: safeRuntimeUrl }).strict(),
      )
      .max(20),
  })
  .strict();
export type RuntimeBootstrapResponse = z.infer<typeof RuntimeBootstrapResponse>;
export const RuntimeBootstrapError = z
  .object({ error: z.literal('Runtime unavailable') })
  .strict();
export const EventStatusSchema = z.enum([
  'draft',
  'open',
  'closed',
  'archived',
]);
export const EventClassSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    eventId: z.string().uuid(),
    name: z.string(),
    code: z.string(),
    vehicleType: z.enum(['car', 'motorcycle', 'kart', 'other']),
    sortOrder: z.number().int(),
    maxParticipants: z.number().int().positive().nullable(),
    closed: z.boolean(),
  })
  .strict();
export const EventSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    startsOn: z.string(),
    endsOn: z.string(),
    status: EventStatusSchema,
    registrationOpensAt: z.string().datetime({ offset: true }).nullable(),
    registrationClosesAt: z.string().datetime({ offset: true }).nullable(),
    openedAt: z.string().datetime({ offset: true }).nullable(),
    closedAt: z.string().datetime({ offset: true }).nullable(),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const CreateEventRequest = z
  .object({
    slug: z.string(),
    name: z.string(),
    startsOn: z.string(),
    endsOn: z.string(),
    registrationOpensAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    registrationClosesAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
  })
  .strict();
export const EventResponse = EventSchema;
export const PublicEventResponse = EventSchema.extend({
  classes: z.array(EventClassSchema),
}).strict();
export const PriceSnapshotSchema = z
  .object({
    version: z.literal('1'),
    currency: z.string().regex(/^[A-Z]{3}$/),
    calculatedAt: z.string().datetime({ offset: true }),
    totalCents: z.number().int().nonnegative(),
    lines: z.array(
      z
        .object({
          classId: z.string().uuid(),
          quantity: z.number().int().positive(),
          baseCents: z.number().int().nonnegative(),
          additionalEntryAdjustmentCents: z.number().int(),
          earlyBirdDiscountCents: z.number().int().nonnegative(),
          totalCents: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export const EntryResponse = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    eventId: z.string().uuid(),
    classId: z.string().uuid(),
    registrationGroupId: z.string().uuid(),
    driverPersonId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    verificationStatus: z.enum(['unverified', 'verified']),
    acceptanceStatus: z.enum([
      'pending',
      'accepted',
      'rejected',
      'waitlisted',
      'withdrawn',
    ]),
    requestedStartNumber: z.string().nullable(),
    priceSnapshotVersion: z.string().nullable(),
    formSnapshotVersion: z.string().nullable(),
    priceSnapshot: PriceSnapshotSchema.nullable().optional(),
    createdAt: z.string().datetime({ offset: true }),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
    deletionReason: z.string().nullable(),
  })
  .strict();
export const AdminEntryListResponse = z
  .object({
    items: z.array(EntryResponse),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
export type EntryResponse = z.infer<typeof EntryResponse>;
export type AdminEntryListResponse = z.infer<typeof AdminEntryListResponse>;
export const CreateEventClassRequest = EventClassSchema.omit({
  id: true,
  organizationId: true,
  eventId: true,
}).strict();
export const UpdateEventClassRequest =
  CreateEventClassRequest.partial().strict();
export const OrganizationResponse = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    status: z.enum(['active', 'disabled']),
    contactEmail: z.string().email().nullable(),
    websiteUrl: z.string().url().nullable(),
    timezone: z.string(),
    locale: z.string(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
export const UpdateOrganizationRequest = z
  .object({
    name: z.string().min(1).max(160).optional(),
    contactEmail: z.string().email().nullable().optional(),
    websiteUrl: z.string().url().nullable().optional(),
    timezone: z.string().min(1).optional(),
    locale: z.string().min(1).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict();
export const JobEnvelope = z
  .object({
    type: z.string().min(1),
    schemaVersion: z.literal(1),
    organizationId: z.string().uuid(),
    payload: z.unknown(),
    correlationId: z.string().min(1),
  })
  .strict();
export type JobEnvelope = z.infer<typeof JobEnvelope>;

export { mailConfigSchema, validateMailConfig } from './config.js';

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
export const PublicRegistrationRequestSchema = z
  .object({
    submissionId: z.string().uuid(),
    formVersion: z.literal('1.0'),
    language: z.enum(['de', 'en']),
    eventSlug: z.string().trim().min(1).max(100),
    person: z
      .object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        email: z.string().email().max(254),
        dateOfBirth: z.string().date(),
        guardianName: z.string().trim().min(1).max(200).optional(),
        guardianEmail: z.string().email().max(254).optional(),
      })
      .strict(),
    entries: z
      .array(
        z
          .object({
            classId: z.string().uuid(),
            vehicle: z
              .object({
                make: z.string().trim().min(1).max(100),
                model: z.string().trim().min(1).max(100),
                year: z.number().int().min(1886).max(2200).nullable(),
                registration: z.string().trim().max(64).nullable(),
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
