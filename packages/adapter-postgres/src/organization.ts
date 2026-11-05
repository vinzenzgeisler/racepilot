import type { Database } from './database.js';

import type {
  OrganizationRepository,
  OrganizationPatch,
  Organization,
} from '@racepilot/core';

import { sql } from 'drizzle-orm';

import { organizations } from './schema/organization.js';

import { organizationId } from '@racepilot/core';

import { eq } from 'drizzle-orm';

export async function ensureCommunityOrganization(
  db: Database,
  config: { slug: string; name: string; timezone: string; locale: string },
): Promise<Organization> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('racepilot.community.bootstrap'))`,
    );
    const rows = await tx.select().from(organizations);
    if (rows.length > 1)
      throw new Error('Community deployment requires exactly one organization');
    if (rows.length === 1) {
      if (rows[0]!.slug !== config.slug)
        throw new Error(
          'Community organization slug does not match configuration',
        );
      return mapOrg(rows[0]!);
    }
    const [row] = await tx
      .insert(organizations)
      .values({ ...config })
      .returning();
    return mapOrg(row!);
  });
}

function mapOrg(r: typeof organizations.$inferSelect): Organization {
  return {
    id: organizationId(r.id),
    slug: r.slug,
    name: r.name,
    status: r.status as 'active' | 'disabled',
    contactEmail: r.contactEmail,
    websiteUrl: r.websiteUrl,
    timezone: r.timezone,
    locale: r.locale,
    currency: r.currency,
  };
}

export function createOrganizationRepository(
  db: Database,
): OrganizationRepository {
  return {
    getById: async (ctx) => {
      const [r] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      return r ? mapOrg(r) : null;
    },
    update: async (ctx, patch: OrganizationPatch) => {
      const [r] = await db
        .update(organizations)
        .set({
          ...('contactEmail' in patch
            ? { contactEmail: patch.contactEmail }
            : {}),
          ...('websiteUrl' in patch ? { websiteUrl: patch.websiteUrl } : {}),
          ...('name' in patch ? { name: patch.name } : {}),
          ...('timezone' in patch ? { timezone: patch.timezone } : {}),
          ...('locale' in patch ? { locale: patch.locale } : {}),
          ...('currency' in patch ? { currency: patch.currency } : {}),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, ctx.organizationId))
        .returning();
      return r ? mapOrg(r) : null;
    },
  };
}
