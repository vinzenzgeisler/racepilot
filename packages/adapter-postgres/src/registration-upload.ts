import type { RequestContext } from '@racepilot/core';
import { uuidPattern } from './database.js';
import { organizations, events } from './schema/organization.js';
import { eq, and } from 'drizzle-orm';
import { registrationFormUploads } from './schema/forms.js';
import { sql } from 'drizzle-orm';
import type { PublicRegistrationDependencies } from './registration-public-types.js';

export function createRegistrationUploadMethods(
  dependencies: PublicRegistrationDependencies,
) {
  const { db } = dependencies;
  return {
    registerCustomFieldUpload: async (
      ctx: RequestContext,
      eventSlug: string,
      fieldKey: string,
      objectId: string,
      uploadTokenHash: string,
    ) => {
      if (
        !uuidPattern.test(objectId) ||
        !/^[a-f0-9]{64}$/.test(uploadTokenHash)
      )
        return false;
      const [event] = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.slug, eventSlug),
            eq(events.status, 'open'),
          ),
        )
        .limit(1);
      if (
        !event ||
        (event.registrationOpensAt && event.registrationOpensAt > new Date()) ||
        (event.registrationClosesAt && event.registrationClosesAt < new Date())
      )
        return false;
      const [org] = await db
        .select({ config: organizations.registrationFormConfig })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId))
        .limit(1);
      const orgConfig = org?.config as
        Record<string, unknown> | null | undefined;
      const eventConfig = event.registrationFormConfig as Record<
        string,
        unknown
      > | null;
      const fields = (eventConfig?.customFields ??
        orgConfig?.customFields ??
        []) as Array<{ key?: string; type?: string }>;
      if (
        !fields.some((field) => field.key === fieldKey && field.type === 'file')
      )
        return false;
      await db.insert(registrationFormUploads).values({
        organizationId: ctx.organizationId,
        eventId: event.id,
        fieldKey,
        objectId,
        uploadTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      return true;
    },
    canDownloadCustomFieldUpload: async (
      ctx: RequestContext,
      eventId: string,
      objectId: string,
    ) => {
      const [upload] = await db
        .select({ id: registrationFormUploads.id })
        .from(registrationFormUploads)
        .where(
          and(
            eq(registrationFormUploads.organizationId, ctx.organizationId),
            eq(registrationFormUploads.eventId, eventId),
            eq(registrationFormUploads.objectId, objectId),
            sql`${registrationFormUploads.registrationGroupId} is not null`,
          ),
        )
        .limit(1);
      return Boolean(upload);
    },
  };
}
