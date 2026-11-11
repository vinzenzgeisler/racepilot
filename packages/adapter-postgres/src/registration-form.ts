import type { RequestContext } from '@racepilot/core';
import { organizations, events, eventClasses } from './schema/organization.js';
import { eq, and } from 'drizzle-orm';
import { eventClassPricingRules } from './schema/billing.js';
import type { PublicRegistrationDependencies } from './registration-public-types.js';

export function createRegistrationFormMethods(
  dependencies: PublicRegistrationDependencies,
) {
  const { db } = dependencies;
  return {
    getForm: async (ctx: RequestContext, eventSlug: string) => {
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
        return null;
      const classRows = await db
        .select()
        .from(eventClasses)
        .where(
          and(
            eq(eventClasses.organizationId, ctx.organizationId),
            eq(eventClasses.eventId, event.id),
            eq(eventClasses.closed, false),
          ),
        )
        .orderBy(eventClasses.sortOrder);
      const pricingRows = await db
        .select()
        .from(eventClassPricingRules)
        .where(
          and(
            eq(eventClassPricingRules.organizationId, ctx.organizationId),
            eq(eventClassPricingRules.eventId, event.id),
          ),
        );
      const [organization] = await db
        .select({
          name: organizations.name,
          contactEmail: organizations.contactEmail,
          registrationSettings: organizations.registrationSettings,
          registrationFormConfig: organizations.registrationFormConfig,
          currency: organizations.currency,
        })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId))
        .limit(1);
      const organizationConfig = organization?.registrationFormConfig as
        Record<string, unknown> | null | undefined;
      const eventConfig = event.registrationFormConfig as Record<
        string,
        unknown
      > | null;
      const mergeSection = (key: string) => ({
        ...((organizationConfig?.[key] as
          Record<string, unknown> | undefined) ?? {}),
        ...((eventConfig?.[key] as Record<string, unknown> | undefined) ?? {}),
      });
      const registrationFormConfig =
        organizationConfig && eventConfig
          ? {
              ...organizationConfig,
              ...eventConfig,
              branding: mergeSection('branding'),
              fields: mergeSection('fields'),
              features: mergeSection('features'),
            }
          : (eventConfig ?? organizationConfig ?? null);
      return {
        organization: {
          name: organization?.name ?? '',
          contactEmail: organization?.contactEmail ?? null,
        },
        event: {
          id: event.id,
          slug: event.slug,
          name: event.name,
          startsOn: event.startsOn,
          registrationClosesAt:
            event.registrationClosesAt?.toISOString() ?? null,
        },
        classes: classRows,
        currency: organization?.currency ?? 'EUR',
        pricing: pricingRows.map((rule) => ({
          classId: rule.classId,
          baseCents: rule.baseCents,
          additionalEntryAdjustmentCents: rule.additionalEntryAdjustmentCents,
          earlyBirdDeadline: rule.earlyBirdDeadline?.toISOString() ?? null,
          earlyBirdDiscountCents: rule.earlyBirdDiscountCents,
        })),
        consents: event.consentTerms,
        registrationSettings: organization?.registrationSettings ?? {
          sharedContactEmail: 'allowed',
          minimumAge: null,
          guardianRequiredBelowAge: 18,
          maximumClassesPerGroup: 8,
        },
        registrationFormConfig,
      };
    },
  };
}
