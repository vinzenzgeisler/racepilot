import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, and } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type {
  RequestContext,
  OrganizationRepository,
  OrganizationPatch,
  Organization,
  EventRepository,
} from '@racepilot/core';
import { organizationId } from '@racepilot/core';
import type { Pool } from 'pg';
export const organizations = pgTable(
  'organization',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    contactEmail: text('contact_email'),
    websiteUrl: text('website_url'),
    timezone: text('timezone').notNull(),
    locale: text('locale').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'organization_status_check',
      sql`${t.status} in ('active','disabled')`,
    ),
  ],
);
export const events = pgTable(
  'event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('event_organization_slug_unique').on(t.organizationId, t.slug),
    unique('event_organization_id_unique').on(t.organizationId, t.id),
    check(
      'event_status_check',
      sql`${t.status} in ('draft','open','closed','archived')`,
    ),
    check('event_dates_check', sql`${t.endsOn} >= ${t.startsOn}`),
  ],
);
export type Database = ReturnType<typeof drizzle>;
export async function migrate(databaseUrl: string): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await drizzleMigrate(drizzle(pool), {
      migrationsFolder: new URL('../migrations', import.meta.url).pathname,
    });
  } finally {
    await pool.end();
  }
}
export async function withOrganizationTransaction<T>(
  db: Database,
  ctx: RequestContext,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.organization_id', ${ctx.organizationId}, true)`,
    );
    return fn(tx as unknown as Database);
  });
}
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
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, ctx.organizationId))
        .returning();
      return r ? mapOrg(r) : null;
    },
  };
}
export function createEventRepository(db: Database): EventRepository {
  return {
    listByOrganization: (ctx) =>
      db
        .select()
        .from(events)
        .where(eq(events.organizationId, ctx.organizationId)),
    getById: async (ctx, eventId) => {
      const [row] = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.id, eventId),
            eq(events.organizationId, ctx.organizationId),
          ),
        );
      return row
        ? { ...row, organizationId: organizationId(row.organizationId) }
        : null;
    },
  };
}
export async function createDatabase(databaseUrl: string) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool), pool: pool as Pool };
}
