import { z } from 'zod';
import { EntryDocumentProjectionSchema } from './documents.js';
import { PassengerModeSchema } from './passenger.js';

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
    orgaCode: z.string().optional(),
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
    revision: z.number().int().min(1).optional(),
    availableActions: z.array(z.string()).optional(),
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
            firstName: z.string(),
            lastName: z.string(),
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
            identityShared: z.boolean().optional(),
            registrationEntryCount: z.number().int().optional(),
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
        consents: z
          .array(
            z
              .object({
                key: z.string(),
                version: z.string(),
                language: z.enum(['de', 'en']),
                acceptedAt: z.string().datetime({ offset: true }),
                text: z.string().nullable(),
                required: z.boolean().nullable(),
              })
              .strict(),
          )
          .optional(),
        passengerMode: PassengerModeSchema.optional(),
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
            source: z.enum(['registration', 'admin']),
            /** recorded: no link yet or expired; invited: a link is open; completed: the co-driver finished. */
            status: z.enum(['recorded', 'invited', 'completed']),
            completedAt: z.string().datetime({ offset: true }).nullable(),
            linkExpiresAt: z.string().datetime({ offset: true }).nullable(),
            consents: z.array(
              z
                .object({
                  key: z.string(),
                  version: z.string(),
                  language: z.enum(['de', 'en']),
                  acceptedAt: z.string().datetime({ offset: true }),
                  text: z.string().nullable(),
                  required: z.boolean().nullable(),
                })
                .strict(),
            ),
          })
          .strict()
          .nullable()
          .optional(),
        spareVehicle: z
          .object({
            make: z.string(),
            model: z.string(),
            year: z.number().int().nullable(),
            registration: z.string().nullable(),
          })
          .strict()
          .nullable()
          .optional(),
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
        eventClass: z
          .object({
            code: z.string(),
            name: z.string(),
            vehicleType: z
              .enum(['car', 'motorcycle', 'kart', 'other'])
              .optional(),
          })
          .strict(),
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
    documentProjection: EntryDocumentProjectionSchema.optional(),
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
export {
  EntryStatusMeaningSchema,
  EntryStatusDimensionConfigSchema,
} from './entry-status-config.js';
export type {
  EntryWorkflowCategory,
  EntryStatusDimensionConfig,
} from './entry-status-config.js';
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
