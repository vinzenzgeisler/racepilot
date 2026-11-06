import { z } from 'zod';
import { hexColor } from './branding.js';

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
export const registrationFieldKeys = [
  'dateOfBirth',
  'phone',
  'street',
  'postalCode',
  'city',
  'country',
  'emergencyContact',
  'publicationPreference',
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
export const RegistrationCustomFieldSchema = z
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
            value: z.string().trim().min(1).max(80),
            label: z
              .object({
                de: z.string().trim().min(1).max(120),
                en: z.string().trim().min(1).max(120),
              })
              .strict(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === 'select' && !field.options?.length)
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Select fields require options',
      });
    if (field.type !== 'select' && field.options !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Only select fields accept options',
      });
    if (
      field.options &&
      new Set(field.options.map((option) => option.value)).size !==
        field.options.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Duplicate option value',
      });
  });
export type RegistrationCustomField = z.infer<
  typeof RegistrationCustomFieldSchema
>;
export const RegistrationCustomFieldAnswersSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  z.union([
    z.string().max(2000),
    z.boolean(),
    z
      .object({
        objectId: z.string().uuid(),
        uploadToken: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
      })
      .strict(),
  ]),
);
const registrationFieldStateDefaults = (key: string) =>
  ({ state: key === 'dateOfBirth' ? 'required' : 'optional' }) as const;
/**
 * Stored configurations predate newer standard fields: a missing key means the default
 * state, so old organization and event configurations stay valid and keep working.
 */
const fieldsWithDefaults = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return value;
    return {
      ...Object.fromEntries(
        registrationFieldKeys.map((key) => [
          key,
          registrationFieldStateDefaults(key),
        ]),
      ),
      ...value,
    };
  },
  z.record(z.enum(registrationFieldKeys), RegistrationFieldConfigSchema),
);
const registrationFormConfigObject = z
  .object({
    branding: RegistrationBrandingSchema,
    welcomeText: z.string().max(4000),
    organizerNotice: z.string().max(10000),
    fields: fieldsWithDefaults,
    customFields: z.array(RegistrationCustomFieldSchema).max(30),
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
    const customFieldKeys = config.customFields.map((field) => field.key);
    if (new Set(customFieldKeys).size !== customFieldKeys.length)
      ctx.addIssue({
        code: 'custom',
        path: ['customFields'],
        message: 'Duplicate custom field key',
      });
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
  .extend({
    // An event overrides single fields; keys it does not name fall back to the organization.
    fields: z
      .partialRecord(
        z.enum(registrationFieldKeys),
        RegistrationFieldConfigSchema,
      )
      .optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.customFields) {
      const keys = config.customFields.map((field) => field.key);
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({
          code: 'custom',
          path: ['customFields'],
          message: 'Duplicate custom field key',
        });
    }
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
      registrationFieldStateDefaults(key),
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
