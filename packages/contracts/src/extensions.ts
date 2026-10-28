import { z } from 'zod';

const extensionId = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const compatibilityRange = z
  .string()
  .regex(/^(?:\^)?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
const surfaceNames = z.array(z.string().min(1)).max(50).default([]);

/**
 * Describes trusted, operator-deployed extension code without making it a
 * permission grant. Each process assembly validates the compatibility range,
 * capabilities, and the surfaces it actually composes.
 */
export const ExtensionManifest = z
  .object({
    id: extensionId,
    compatibility: z
      .object({
        core: compatibilityRange,
        contracts: compatibilityRange,
      })
      .strict(),
    capabilities: z.array(extensionId).max(100),
    provides: z
      .object({
        api: surfaceNames,
        ui: surfaceNames,
        jobs: surfaceNames,
        migrations: surfaceNames,
      })
      .strict(),
  })
  .strict();

export type ExtensionManifestData = z.infer<typeof ExtensionManifest>;
