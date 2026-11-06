import { z } from 'zod';

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
export const PublicationPreferenceSchema = z.enum([
  'name_visible',
  'initials',
  'hidden',
]);
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
            phone: z.string().nullable().optional(),
            street: z.string().nullable().optional(),
            postalCode: z.string().nullable().optional(),
            city: z.string().nullable().optional(),
            emergencyContactName: z.string().nullable().optional(),
            emergencyContactPhone: z.string().nullable().optional(),
            publicationPreference:
              PublicationPreferenceSchema.nullable().optional(),
          })
          .strict(),
        vehicle: z
          .object({
            make: z.string(),
            model: z.string(),
            year: z.number().int().nullable(),
            imageUrl: z.string().nullable().optional(),
            registration: z.string().nullable().optional(),
            vehicleType: z.string().nullable().optional(),
            displacementCc: z.number().int().nullable().optional(),
            cylinders: z.number().int().nullable().optional(),
            ownerName: z.string().nullable().optional(),
            history: z.string().nullable().optional(),
          })
          .strict(),
        invoice: z
          .object({
            id: z.string().uuid(),
            paymentReference: z.string(),
            currency: z.string(),
            totalCents: z.number().int().nonnegative(),
            paidCents: z.number().int(),
            status: z.enum(['open', 'partially_paid', 'paid', 'cancelled']),
          })
          .strict()
          .nullable()
          .optional(),
        eventClass: z.object({ code: z.string(), name: z.string() }).strict(),
        startNumber: z.string().nullable(),
        customAnswers: z.array(
          z
            .object({
              key: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
              label: z.string(),
              value: z.union([z.string(), z.boolean()]).nullable(),
              fileDownloadUrl: z.string().nullable(),
            })
            .strict(),
        ),
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
    vehicleType: optionalText(60),
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
