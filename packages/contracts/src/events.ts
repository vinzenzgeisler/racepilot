import { z } from 'zod';
import { PassengerModeSchema } from './passenger.js';

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
    passengerMode: PassengerModeSchema.default('optional'),
  })
  .strict();
export const EventSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    slug: z.string(),
    orgaCodePrefix: z.string().nullable().optional(),
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
    orgaCodePrefix: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{1,12}$/)
      .nullable()
      .optional(),
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
export const CreateEventClassRequest = EventClassSchema.omit({
  id: true,
  organizationId: true,
  eventId: true,
})
  // A request that omits the mode keeps the stored one; the response default does not apply.
  .extend({ passengerMode: PassengerModeSchema.optional() })
  .strict();
export const UpdateEventClassRequest =
  CreateEventClassRequest.partial().strict();
