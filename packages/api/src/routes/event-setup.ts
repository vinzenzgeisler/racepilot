import { z } from 'zod';
import { createEventSetup } from '@racepilot/core';
import {
  CreateEventRequest,
  EventResponse,
  PassengerModeSchema,
} from '@racepilot/contracts';
import type { ApiRoutesContext } from './context.js';

export function registerEventSetupRoute(apiContext: ApiRoutesContext): void {
  apiContext.app.post('/admin/events/setup', async (c) => {
    const guard = await apiContext.requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const parsed = z
      .object({
        event: CreateEventRequest,
        classes: z
          .array(
            z
              .object({
                name: z.string(),
                code: z.string(),
                vehicleType: z.enum(['car', 'motorcycle', 'kart', 'other']),
                maxParticipants: z
                  .number()
                  .int()
                  .positive()
                  .nullable()
                  .optional(),
                closed: z.boolean().optional(),
                passengerMode: PassengerModeSchema.optional(),
                price: z.object({
                  baseCents: z.number().int().nonnegative(),
                  additionalEntryAdjustmentCents: z.number().int(),
                  earlyBirdDeadline: z
                    .string()
                    .datetime({ offset: true })
                    .nullable(),
                  earlyBirdDiscountCents: z.number().int().nonnegative(),
                }),
              })
              .strict(),
          )
          .min(1),
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
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const event = await createEventSetup(
        context,
        {
          event: {
            slug: parsed.data.event.slug,
            name: parsed.data.event.name,
            startsOn: parsed.data.event.startsOn,
            endsOn: parsed.data.event.endsOn,
            ...(parsed.data.event.registrationOpensAt !== undefined
              ? { registrationOpensAt: parsed.data.event.registrationOpensAt }
              : {}),
            ...(parsed.data.event.registrationClosesAt !== undefined
              ? { registrationClosesAt: parsed.data.event.registrationClosesAt }
              : {}),
          },
          classes: parsed.data.classes.map((item, index) => ({
            name: item.name,
            code: item.code,
            vehicleType: item.vehicleType,
            sortOrder: index,
            maxParticipants: item.maxParticipants ?? null,
            closed: item.closed ?? false,
            ...(item.passengerMode
              ? { passengerMode: item.passengerMode }
              : {}),
            price: { classId: `class:${index}`, ...item.price },
          })),
          terms: parsed.data.terms,
          actor: context.subject?.subject ?? 'event-setup',
        },
        { events: apiContext.deps.events, setup: apiContext.deps.eventSetup },
      );
      return c.json(EventResponse.parse(event), 201);
    } catch {
      return c.json({ error: 'Forbidden or invalid event setup' }, 403);
    }
  });
}
