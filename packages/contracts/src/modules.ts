import { z } from 'zod';

const moduleId = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const semver = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const range = z.string().regex(/^\^?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const permissionKey = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*:[a-z][a-z0-9_-]*$/);

/**
 * Serializable part of an event-module manifest (ADR 0004). The Zod config schema
 * and route handlers are code and live in the module definition, not in this data.
 */
export const ModuleManifestSchema = z
  .object({
    id: moduleId,
    version: semver,
    displayName: z.string().min(1).max(80),
    description: z.string().max(300).optional(),
    gallery: z
      .object({
        name: z
          .object({
            de: z.string().min(1).max(80),
            en: z.string().min(1).max(80),
          })
          .strict(),
        shortDescription: z
          .object({
            de: z.string().min(1).max(240),
            en: z.string().min(1).max(240),
          })
          .strict(),
        longDescription: z
          .object({
            de: z.string().min(1).max(5000),
            en: z.string().min(1).max(5000),
          })
          .strict(),
        category: z.enum([
          'timing',
          'scrutineering',
          'communication',
          'payments',
          'operations',
          'other',
        ]),
        icon: z.string().min(1).max(500),
        screenshots: z.array(z.string().url()).max(10).optional(),
        source: z.enum(['core', 'official', 'private']),
        editions: z.array(z.enum(['community', 'cloud'])).min(1),
        entitlement: z.string().regex(/^(included|plan:[a-z0-9][a-z0-9-]*)$/),
      })
      .strict(),
    dependencies: z.array(z.object({ id: moduleId, range }).strict()).max(20),
    permissions: z
      .array(
        z
          .object({
            key: permissionKey,
            description: z.string().min(1).max(200),
            impliedBy: z.array(permissionKey).min(1).max(10),
          })
          .strict(),
      )
      .max(50),
    capabilities: z.array(z.string().min(1).max(100)).max(20),
    tables: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(50),
    migrations: z.array(z.string().min(1)).max(50),
    routes: z
      .array(
        z
          .object({
            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
            path: z.string().regex(/^\/[A-Za-z0-9_\-/:.]+$/),
            permission: permissionKey.optional(),
            archivedRead: z.boolean().optional(),
            publicPath: z
              .string()
              .regex(/^\/[A-Za-z0-9_\-/:.]+$/)
              .optional(),
          })
          .strict(),
      )
      .max(100),
    ui: z
      .array(
        z
          .object({
            entryPoint: z.string().min(1).max(100),
            navigationLabel: z.string().max(80).optional(),
            permission: permissionKey.optional(),
          })
          .strict(),
      )
      .max(20),
    jobs: z.array(z.string().regex(/^[a-z][a-z0-9_.-]{0,119}$/)).max(20),
  })
  .strict();
export type ModuleManifestData = z.infer<typeof ModuleManifestSchema>;

export const ModuleChangeRequest = z
  .object({
    enabled: z.boolean().optional(),
    config: z.unknown().optional(),
    expectedVersion: z.number().int().min(0).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => value.enabled !== undefined || value.config !== undefined);
export type ModuleChangeRequest = z.infer<typeof ModuleChangeRequest>;

export const ModuleViewSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    displayName: z.string(),
    description: z.string(),
    gallery: ModuleManifestSchema.shape.gallery,
    dependencies: z.array(z.object({ id: z.string(), range: z.string() })),
    enabled: z.boolean(),
    entitled: z.boolean(),
    configValid: z.boolean(),
    available: z.boolean(),
    status: z.enum(['available', 'active', 'unavailable']),
    unavailableReason: z
      .enum(['entitlement', 'dependency', 'edition'])
      .nullable(),
    organizationEnabled: z.boolean().optional(),
    config: z.unknown(),
    configSchema: z.unknown(),
    stateVersion: z.number().int().nullable(),
    updatedAt: z.string().nullable(),
    updatedBy: z.string().nullable(),
  })
  .strict();
export const ModuleListResponse = z
  .object({ modules: z.array(ModuleViewSchema) })
  .strict();

/** Payload of an event-scoped module job; the envelope carries the organization. */
export const ModuleJobPayload = z
  .object({ eventId: z.string().uuid(), data: z.unknown().optional() })
  .strict();
export type ModuleJobPayload = z.infer<typeof ModuleJobPayload>;
