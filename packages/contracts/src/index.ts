import { z } from 'zod';
export { ExtensionManifest } from './extensions.js';
export type { ExtensionManifestData } from './extensions.js';
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
// Runtime brand colors are accepted as source colors and transformed to
// accessible foregrounds at render time; rejecting a brand color would make
// the design inaccessible to organizations without helping them fix it.
const primaryColor = hexColor;
const brandAccentColor = hexColor;
export const RegistrationBrandingSchema = z
  .object({
    logoLightObjectId: z.string().uuid().nullable(),
    logoDarkObjectId: z.string().uuid().nullable(),
    headerImageObjectId: z.string().uuid().nullable(),
    primaryColor: hexColor,
    accentColor: hexColor,
    headingFont: z.enum(['archivo']),
    corners: z.enum(['square', 'rounded']),
  })
  .strict();
export type RegistrationBranding = z.infer<typeof RegistrationBrandingSchema>;
export const RegistrationFieldConfigSchema = z
  .object({
    state: z.enum(['required', 'optional', 'hidden']),
  })
  .strict();
const registrationFieldKeys = [
  'dateOfBirth',
  'phone',
  'street',
  'postalCode',
  'city',
  'country',
  'emergencyContact',
  'biography',
  'organizerNotes',
  'requestedStartNumber',
  'make',
  'model',
  'year',
  'displacement',
  'cylinders',
  'owner',
  'history',
  'vehicleImage',
] as const;
const registrationFormConfigObject = z
  .object({
    branding: RegistrationBrandingSchema,
    welcomeText: z.string().max(4000),
    organizerNotice: z.string().max(10000),
    fields: z.record(
      z.enum(registrationFieldKeys),
      RegistrationFieldConfigSchema,
    ),
    customFields: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
            type: z.enum(['text', 'select', 'yes_no', 'file']),
            required: z.boolean(),
            label: z
              .object({
                de: z.string().trim().min(1).max(120),
                en: z.string().trim().min(1).max(120),
              })
              .strict(),
            options: z
              .array(
                z
                  .object({
                    value: z.string().min(1).max(80),
                    label: z
                      .object({
                        de: z.string().min(1).max(120),
                        en: z.string().min(1).max(120),
                      })
                      .strict(),
                  })
                  .strict(),
              )
              .max(30)
              .optional(),
          })
          .strict(),
      )
      .max(30),
    features: z
      .object({
        passenger: z.boolean(),
        spareVehicle: z.boolean(),
        multipleEntries: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const RegistrationFormConfigSchema =
  registrationFormConfigObject.superRefine((config, ctx) => {
    if (config.fields.dateOfBirth?.state !== 'required')
      ctx.addIssue({
        code: 'custom',
        path: ['fields', 'dateOfBirth'],
        message:
          'Date of birth is required for age and guardian eligibility checks',
      });
  });
export type RegistrationFormConfig = z.infer<
  typeof RegistrationFormConfigSchema
>;
export const RegistrationFormConfigPatchSchema = registrationFormConfigObject
  .partial()
  .strict()
  .superRefine((config, ctx) => {
    if (
      config.fields?.dateOfBirth &&
      config.fields.dateOfBirth.state !== 'required'
    )
      ctx.addIssue({
        code: 'custom',
        path: ['fields', 'dateOfBirth'],
        message:
          'Date of birth is required for age and guardian eligibility checks',
      });
  });
export type RegistrationFormConfigPatch = z.infer<
  typeof RegistrationFormConfigPatchSchema
>;
export const defaultRegistrationFormConfig: RegistrationFormConfig = {
  branding: {
    logoLightObjectId: null,
    logoDarkObjectId: null,
    headerImageObjectId: null,
    primaryColor: '#193B30',
    accentColor: '#E2531F',
    headingFont: 'archivo',
    corners: 'square',
  },
  welcomeText: '',
  organizerNotice: '',
  fields: Object.fromEntries(
    registrationFieldKeys.map((key) => [
      key,
      { state: key === 'dateOfBirth' ? 'required' : 'optional' },
    ]),
  ) as RegistrationFormConfig['fields'],
  customFields: [],
  features: { passenger: false, spareVehicle: false, multipleEntries: true },
};
export function mergeRegistrationFormConfig(
  base: RegistrationFormConfig,
  override?: RegistrationFormConfigPatch | null,
): RegistrationFormConfig {
  if (!override) return base;
  return RegistrationFormConfigSchema.parse({
    ...base,
    ...override,
    branding: { ...base.branding, ...override.branding },
    fields: { ...base.fields, ...override.fields },
    features: { ...base.features, ...override.features },
  });
}
export function deriveAccessibleBrandColors(primary: string, accent: string) {
  const contrast = (a: string, b: string) => {
    const l1 = luminance(a),
      l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const dark = '#111A16',
    light = '#FFFFFF';
  const darkenForSurface = (color: string) => {
    if (Math.max(contrast(color, light), contrast(color, dark)) >= 4.5)
      return color.toUpperCase();
    const values = color
      .slice(1)
      .match(/../g)!
      .map((part) => parseInt(part, 16));
    for (let step = 99; step >= 0; step--) {
      const candidate = `#${values
        .map((value) =>
          Math.round((value * step) / 100)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
      if (contrast(candidate, light) >= 4.5) return candidate.toUpperCase();
    }
    return dark;
  };
  const primarySurface = darkenForSurface(primary),
    accentSurface = darkenForSurface(accent);
  const foreground = (background: string) =>
    contrast(background, light) >= contrast(background, dark) ? light : dark;
  let linkColor = primary.toUpperCase();
  if (contrast(linkColor, '#F5F4EE') < 4.5) {
    const values = linkColor
      .slice(1)
      .match(/../g)!
      .map((part) => parseInt(part, 16));
    for (let step = 99; step >= 0; step--) {
      const candidate = `#${values
        .map((value) =>
          Math.round((value * step) / 100)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
      if (contrast(candidate, '#F5F4EE') >= 4.5) {
        linkColor = candidate.toUpperCase();
        break;
      }
    }
  }
  return {
    primarySurface,
    accentSurface,
    primaryForeground: foreground(primarySurface),
    accentForeground: foreground(accentSurface),
    linkColor,
    contrastNotice:
      primarySurface !== primary.toUpperCase() ||
      accentSurface !== accent.toUpperCase() ||
      linkColor !== primary.toUpperCase(),
  };
}
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
    acceptanceStatus: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    requestedStartNumber: z.string().nullable(),
    priceSnapshotVersion: z.string().nullable(),
    formSnapshotVersion: z.string().nullable(),
    priceSnapshot: PriceSnapshotSchema.nullable().optional(),
    createdAt: z.string().datetime({ offset: true }),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
    deletionReason: z.string().nullable(),
    adminHistory: z
      .array(
        z
          .object({
            id: z.string(),
            kind: z.enum(['entry', 'status', 'payment', 'email']),
            label: z.string(),
            actor: z.string(),
            occurredAt: z.string().datetime({ offset: true }),
            detail: z.string(),
          })
          .strict(),
      )
      .optional(),
    adminDetails: z
      .object({
        driver: z
          .object({
            name: z.string(),
            dateOfBirth: z.string().nullable(),
            country: z.string().nullable(),
            email: z.string().nullable(),
            emailVerified: z.boolean(),
          })
          .strict(),
        vehicle: z
          .object({
            make: z.string(),
            model: z.string(),
            year: z.number().int().nullable(),
          })
          .strict(),
        eventClass: z.object({ code: z.string(), name: z.string() }).strict(),
        startNumber: z.string().nullable(),
      })
      .strict()
      .optional(),
    statusProjection: z
      .object({
        dimensions: z.array(
          z
            .object({
              key: z.enum([
                'entry',
                'payment',
                'technical_inspection',
                'waiver',
                'email_verification',
              ]),
              value: z.string().min(1),
              label: z.object({ de: z.string(), en: z.string() }).strict(),
              meaning: z.enum([
                'new',
                'in_progress',
                'missing',
                'done',
                'rejected',
                'not_relevant',
              ]),
              required: z.boolean(),
              nextAction: z
                .object({
                  key: z.string().min(1),
                  label: z.object({ de: z.string(), en: z.string() }).strict(),
                })
                .strict()
                .nullable(),
            })
            .strict(),
        ),
        documents: z
          .object({
            complete: z.number().int().nonnegative(),
            total: z.number().int().nonnegative(),
          })
          .strict(),
        hints: z.array(
          z
            .object({
              key: z.enum(['double_starter', 'passenger', 'late_entry']),
              present: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
  })
  .strict();
export const EntryStatusMeaningSchema = z.enum([
  'new',
  'in_progress',
  'missing',
  'done',
  'rejected',
  'not_relevant',
]);
const EntryStatusDimensionValueSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    labels: z
      .object({
        de: z.string().trim().min(1).max(80),
        en: z.string().trim().min(1).max(80),
      })
      .strict(),
    meaning: EntryStatusMeaningSchema,
  })
  .strict();
export const EntryStatusDimensionConfigSchema = z
  .object({
    version: z.literal(1),
    dimensions: z
      .array(
        z
          .object({
            key: z.enum([
              'payment',
              'technical_inspection',
              'waiver',
              'email_verification',
            ]),
            required: z.boolean(),
            values: z.array(EntryStatusDimensionValueSchema).min(1).max(32),
            transitions: z
              .array(
                z
                  .object({ from: z.string().min(1), to: z.string().min(1) })
                  .strict(),
              )
              .max(128),
          })
          .strict(),
      )
      .length(4),
  })
  .strict()
  .superRefine((config, ctx) => {
    const keys = config.dimensions.map(({ key }) => key);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate status dimension' });
    for (const dimension of config.dimensions) {
      const valueKeys = dimension.values.map(({ key }) => key);
      if (new Set(valueKeys).size !== valueKeys.length)
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate ${dimension.key} value`,
        });
      for (const edge of dimension.transitions)
        if (!valueKeys.includes(edge.from) || !valueKeys.includes(edge.to))
          ctx.addIssue({
            code: 'custom',
            message: `Unknown ${dimension.key} transition value`,
          });
      if (
        (dimension.key === 'payment' ||
          dimension.key === 'email_verification') &&
        dimension.transitions.length
      )
        ctx.addIssue({
          code: 'custom',
          message: `${dimension.key} is derived`,
        });
    }
    for (const required of [
      'payment',
      'technical_inspection',
      'waiver',
      'email_verification',
    ])
      if (!keys.includes(required as (typeof keys)[number]))
        ctx.addIssue({
          code: 'custom',
          message: `Missing status dimension ${required}`,
        });
  });
export type EntryStatusDimensionConfig = z.infer<
  typeof EntryStatusDimensionConfigSchema
>;
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
    person: z
      .object({
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
      })
      .strict(),
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
    guardianName: z.string().max(200),
    guardianEmail: z.string().max(254),
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
          })
          .strict(),
      )
      .max(8),
    accepted: z.record(z.string().max(120), z.boolean()),
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
export {
  ModuleManifestSchema,
  ModuleChangeRequest,
  ModuleViewSchema,
  ModuleListResponse,
  ModuleJobPayload,
} from './modules.js';
export type { ModuleManifestData } from './modules.js';
