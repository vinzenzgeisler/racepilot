import { z } from 'zod';

/** How a class treats a co-driver. It only applies where the event's form offers co-drivers at all. */
export const PassengerModeSchema = z.enum(['none', 'optional', 'required']);
export type PassengerMode = z.infer<typeof PassengerModeSchema>;
