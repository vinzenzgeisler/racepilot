import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { createRequestContext, organizationId } from '@racepilot/core';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './database-service.js';
import { createEntryDetailRepository } from './entry-detail.js';
import { createEntryRepository } from './entry-repository.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
const migrations = fileURLToPath(new URL('../migrations', import.meta.url));

/** Migrations up to and including the given tag, as a drizzle migrations folder. */
function migrationsUpTo(tag: string) {
  const folder = mkdtempSync(join(tmpdir(), 'racepilot-migrations-'));
  mkdirSync(join(folder, 'meta'));
  const journal = JSON.parse(
    readFileSync(join(migrations, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> };
  const keep = journal.entries.slice(
    0,
    journal.entries.findIndex((entry) => entry.tag === tag) + 1,
  );
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: keep }),
  );
  for (const entry of keep)
    cpSync(
      join(migrations, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  return folder;
}

describe.skipIf(!url)('registration contact scope migration', () => {
  it('carries person contact data to every registration without loss and scopes later edits', async () => {
    const scratch = `migration_scope_${crypto.randomUUID().replaceAll('-', '')}`;
    const admin = new Pool({ connectionString: url! });
    await admin.query(`create database ${scratch}`);
    const scratchUrl = new URL(url!);
    scratchUrl.pathname = `/${scratch}`;
    const connectionString = scratchUrl.toString();
    const pool = new Pool({ connectionString });
    try {
      // Start from the schema of 0024, where the contact data still lives on the person.
      await runMigrations({ connectionString });
      await drizzleMigrate(drizzle(pool), {
        migrationsFolder: migrationsUpTo('0024_entry_detail_fields'),
      });
      const one = async <T extends Record<string, unknown>>(
        text: string,
        values: unknown[] = [],
      ) => (await pool.query<T>(text, values)).rows[0]!;
      const org = await one<{ id: string }>(
        `insert into organization (slug, name, timezone, locale) values ('scope', 'Scope', 'UTC', 'de') returning id`,
      );
      const contact = [
        '+49 351 123',
        'Musterweg 1',
        '01067',
        'Dresden',
        'Anna Notfall',
        '+49 351 999',
        'name_visible',
      ];
      const person = (first: string, last: string, values: unknown[]) =>
        one<{ id: string }>(
          `insert into person (organization_id, first_name, last_name, email, email_normalized, phone, street, postal_code, city, emergency_contact_name, emergency_contact_phone, publication_preference)
           values ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
          [org.id, first, last, `${first}@example.test`, ...values],
        );
      const returning = await person('Anna', 'Rennfahrerin', contact);
      const partial = await person('Paul', 'Teilweise', [
        '+49 7',
        null,
        null,
        null,
        null,
        null,
        'hidden',
      ]);
      const empty = await person('Eva', 'Leer', Array(7).fill(null));
      const registrations: Record<string, { group: string; entry: string }> =
        {};
      for (const [index, who] of [
        ['0', returning],
        ['1', returning],
        ['2', partial],
        ['3', empty],
      ] as const) {
        const event = await one<{ id: string }>(
          `insert into event (organization_id, slug, name, starts_on, ends_on) values ($1, $2, $3, '2030-01-01', '2030-01-01') returning id`,
          [org.id, `event-${index}`, `Event ${index}`],
        );
        const klass = await one<{ id: string }>(
          `insert into event_class (organization_id, event_id, name, code, vehicle_type) values ($1, $2, 'Klasse', 'K', 'car') returning id`,
          [org.id, event.id],
        );
        const vehicle = await one<{ id: string }>(
          `insert into vehicle (organization_id, make, model) values ($1, 'NSU', $2) returning id`,
          [org.id, `TT ${index}`],
        );
        const group = await one<{ id: string }>(
          `insert into registration_group (organization_id, event_id, person_id) values ($1, $2, $3) returning id`,
          [org.id, event.id, who.id],
        );
        const entry = await one<{ id: string }>(
          `insert into entry (organization_id, event_id, class_id, registration_group_id, driver_person_id, vehicle_id, requested_start_number)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [
            org.id,
            event.id,
            klass.id,
            group.id,
            who.id,
            vehicle.id,
            `${10 + Number(index)}`,
          ],
        );
        registrations[index] = { group: group.id, entry: entry.id };
      }

      // Run 0025 (and anything after it) on top of that data.
      await drizzleMigrate(drizzle(pool), { migrationsFolder: migrations });

      const columns = await pool.query(
        `select column_name from information_schema.columns where table_name = 'person' and column_name in ('phone','street','postal_code','city','emergency_contact_name','emergency_contact_phone','publication_preference')`,
      );
      expect(columns.rows).toEqual([]);
      const groupContact = async (index: string) =>
        (
          await pool.query(
            `select phone, street, postal_code, city, emergency_contact_name, emergency_contact_phone, publication_preference from registration_group where id = $1`,
            [registrations[index]!.group],
          )
        ).rows[0];
      const expected = {
        phone: contact[0],
        street: contact[1],
        postal_code: contact[2],
        city: contact[3],
        emergency_contact_name: contact[4],
        emergency_contact_phone: contact[5],
        publication_preference: contact[6],
      };
      // Both registrations of the returning driver keep all seven values.
      expect(await groupContact('0')).toEqual(expected);
      expect(await groupContact('1')).toEqual(expected);
      expect(await groupContact('2')).toEqual({
        ...Object.fromEntries(Object.keys(expected).map((key) => [key, null])),
        phone: '+49 7',
        publication_preference: 'hidden',
      });
      expect(await groupContact('3')).toEqual(
        Object.fromEntries(Object.keys(expected).map((key) => [key, null])),
      );

      // From here on changes are scoped: only the edited registration changes.
      const { db, pool: appPool } = await createDatabase(connectionString);
      try {
        const ctx = createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(org.id),
          permissions: new Set(['entry:read', 'entry:write']),
          capabilities: new Set(),
          correlationId: 'migration-test',
        });
        expect(
          await createEntryDetailRepository(db).updateDriver(
            ctx,
            registrations['0']!.entry,
            { phone: '+49 999', city: 'Leipzig' },
            'oidc#admin',
          ),
        ).toBe('updated');
        expect(await groupContact('0')).toEqual({
          ...expected,
          phone: '+49 999',
          city: 'Leipzig',
        });
        expect(await groupContact('1')).toEqual(expected);
        const entryRepo = createEntryRepository(db);
        expect(
          (await entryRepo.getById(ctx, registrations['1']!.entry))
            ?.adminDetails?.driver,
        ).toMatchObject({ phone: '+49 351 123', city: 'Dresden' });
      } finally {
        await appPool.end();
      }
    } finally {
      await pool.end();
      // Wait for every connection (including ones other libraries close lazily) instead of
      // terminating them, which would surface as unhandled connection errors.
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const open = await admin.query(
          'select count(*)::int as count from pg_stat_activity where datname = $1',
          [scratch],
        );
        if (open.rows[0].count === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await admin.query(`drop database ${scratch}`);
      await admin.end();
    }
  }, 60_000);
});
