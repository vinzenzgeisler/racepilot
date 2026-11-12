import { z } from 'zod';

export const EntryStatusMeaningSchema = z.enum([
  'new',
  'in_progress',
  'missing',
  'done',
  'rejected',
  'not_relevant',
]);
/** Closed set of entry workflow categories; mirrors `entryWorkflowCategories` in core. */
export type EntryWorkflowCategory =
  'pending' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn';
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
