import type { Database } from './database.js';

import type { RequestContext } from '@racepilot/core';

import { organizations, events } from './schema/organization.js';

import { eq, and } from 'drizzle-orm';

import {
  registrationSettingsAudit,
  registrationFormConfigAudit,
} from './schema/forms.js';

export type RegistrationSettings = {
  sharedContactEmail: 'allowed' | 'disallowed';
  minimumAge: number | null;
  guardianRequiredBelowAge: number;
  maximumClassesPerGroup: number;
};

export function createRegistrationSettingsRepository(db: Database) {
  return {
    get: async (ctx: RequestContext): Promise<RegistrationSettings> => {
      const [row] = await db
        .select({ settings: organizations.registrationSettings })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      return (
        row?.settings ?? {
          sharedContactEmail: 'allowed',
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        }
      );
    },
    update: async (
      ctx: RequestContext,
      settings: RegistrationSettings,
      actor: string,
    ): Promise<RegistrationSettings> =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({ settings: organizations.registrationSettings })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .for('update');
        if (!before) throw new Error('Organization not found');
        const [updated] = await tx
          .update(organizations)
          .set({ registrationSettings: settings, updatedAt: new Date() })
          .where(eq(organizations.id, ctx.organizationId))
          .returning({ settings: organizations.registrationSettings });
        await tx.insert(registrationSettingsAudit).values({
          organizationId: ctx.organizationId,
          actor,
          beforeSettings: before.settings,
          afterSettings: settings,
        });
        return updated!.settings;
      }),
  };
}

export function createRegistrationFormConfigRepository(db: Database) {
  return {
    getOrganization: async (ctx: RequestContext) => {
      const [row] = await db
        .select({ config: organizations.registrationFormConfig })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      return row?.config ?? null;
    },
    updateOrganization: async (
      ctx: RequestContext,
      config: Record<string, unknown>,
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({ config: organizations.registrationFormConfig })
          .from(organizations)
          .where(eq(organizations.id, ctx.organizationId))
          .for('update');
        if (!before) return null;
        const [after] = await tx
          .update(organizations)
          .set({ registrationFormConfig: config, updatedAt: new Date() })
          .where(eq(organizations.id, ctx.organizationId))
          .returning({ config: organizations.registrationFormConfig });
        await tx.insert(registrationFormConfigAudit).values({
          organizationId: ctx.organizationId,
          actor,
          beforeConfig: before.config,
          afterConfig: config,
        });
        return after?.config ?? null;
      }),
    getEvent: async (ctx: RequestContext, eventId: string) => {
      const [row] = await db
        .select({ config: events.registrationFormConfig })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        );
      return row?.config ?? null;
    },
    updateEvent: async (
      ctx: RequestContext,
      eventId: string,
      config: Record<string, unknown>,
      actor: string,
    ) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select({ config: events.registrationFormConfig })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, eventId),
            ),
          )
          .for('update');
        if (!before) return null;
        const [after] = await tx
          .update(events)
          .set({ registrationFormConfig: config, updatedAt: new Date() })
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, eventId),
            ),
          )
          .returning({ config: events.registrationFormConfig });
        await tx.insert(registrationFormConfigAudit).values({
          organizationId: ctx.organizationId,
          eventId,
          actor,
          beforeConfig: before.config,
          afterConfig: config,
        });
        return after?.config ?? null;
      }),
  };
}

export interface PublicRegistrationPayload {
  submissionId: string;
  formVersion: '1.0';
  eventSlug: string;
  language: 'de' | 'en';
  person: {
    firstName: string;
    lastName: string;
    email: string;
    dateOfBirth: string;
    country?: string | undefined;
    guardianName?: string | undefined;
    guardianEmail?: string | undefined;
    phone?: string | null | undefined;
    street?: string | null | undefined;
    postalCode?: string | null | undefined;
    city?: string | null | undefined;
    emergencyContactName?: string | null | undefined;
    emergencyContactPhone?: string | null | undefined;
    publicationPreference?:
      'name_visible' | 'initials' | 'hidden' | null | undefined;
  };
  customAnswers?: Record<
    string,
    string | boolean | { objectId: string; uploadToken: string }
  >;
  entries: Array<{
    classId: string;
    requestedStartNumber?: string | null | undefined;
    vehicle: {
      make: string;
      model: string;
      year: number | null;
      registration: string | null;
      displacementCc?: number | null | undefined;
      cylinders?: number | null | undefined;
      ownerName?: string | null | undefined;
      history?: string | null | undefined;
    };
    passenger?:
      | {
          firstName: string;
          lastName: string;
          email?: string | null | undefined;
        }
      | null
      | undefined;
    spareVehicle?:
      | {
          make: string;
          model: string;
          year: number | null;
          registration: string | null;
        }
      | null
      | undefined;
  }>;
  consents: Array<{
    key: string;
    version: string;
    hash: string;
    accepted: true;
  }>;
}
