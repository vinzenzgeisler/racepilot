import { z } from 'zod';

const EventIdSchema = z.string().uuid();
const CountSchema = z.number().int().nonnegative();

/** Filters that the list and the CSV export share. Empty values are never sent. */
export const EntryFilterKeySchema = z.enum([
  'classId',
  'acceptanceStatus',
  'verificationStatus',
  'paymentStatus',
  'search',
]);
export type EntryFilterKey = z.infer<typeof EntryFilterKeySchema>;

export const OverviewWarningSchema = z.object({
  type: z.literal('unverified-email'),
  count: CountSchema,
  filter: z.object({
    eventId: EventIdSchema,
    verificationStatus: z.literal('unverified'),
  }),
});
export type OverviewWarning = z.infer<typeof OverviewWarningSchema>;

export const EventOverviewSchema = z.object({
  eventId: EventIdSchema,
  statuses: z.record(z.string(), CountSchema),
  openPayments: z.object({
    count: CountSchema,
    amountCents: CountSchema,
    currency: z.string().min(1),
  }),
  classes: z.array(
    z.object({
      classId: z.string().uuid(),
      name: z.string(),
      occupied: CountSchema,
      capacity: CountSchema.nullable(),
    }),
  ),
  daysUntilRegistrationCloses: CountSchema.nullable(),
  warnings: z.array(OverviewWarningSchema),
  missingDocuments: z.object({ count: CountSchema }),
});
export type EventOverview = z.infer<typeof EventOverviewSchema>;

export const EXPORT_FIELDS = [
  'driver',
  'vehicle',
  'class',
  'startNumber',
  'status',
  'price',
] as const;
export const ExportFieldSchema = z.enum(EXPORT_FIELDS);
export type ExportField = z.infer<typeof ExportFieldSchema>;

export const EXPORT_DELIMITERS = [';', ','] as const;
export const ExportDelimiterSchema = z.enum(EXPORT_DELIMITERS);
export type ExportDelimiter = z.infer<typeof ExportDelimiterSchema>;

export const ExportJobStateSchema = z.enum([
  'running',
  'finished',
  'failed',
  'expired',
]);
export type ExportJobState = z.infer<typeof ExportJobStateSchema>;

export const ExportFiltersSchema = z
  .object({
    classId: z.string().uuid().optional(),
    acceptanceStatus: z.string().optional(),
    verificationStatus: z.enum(['unverified', 'verified']).optional(),
    paymentStatus: z.string().optional(),
    search: z.string().optional(),
  })
  .passthrough();
export type ExportFilters = z.infer<typeof ExportFiltersSchema>;

export const ExportJobSchema = z.object({
  jobId: z.string().uuid(),
  status: ExportJobStateSchema,
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  fields: z.array(z.string()),
  filters: ExportFiltersSchema,
  downloadUrl: z.string().nullable(),
});
export type ExportJob = z.infer<typeof ExportJobSchema>;
export const ExportJobListSchema = z.array(ExportJobSchema);

export const ExportJobStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: ExportJobStateSchema,
  error: z.string().nullable().optional(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type ExportJobStatus = z.infer<typeof ExportJobStatusSchema>;

/** A freshly queued artifact job: the CSV route says `running`, the confirmation route `queued`. */
export const ExportQueuedSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['queued', 'running']),
});
export type ExportQueued = z.infer<typeof ExportQueuedSchema>;
