import {
  createDatabase,
  ensureCommunityOrganization,
  events,
} from '@racepilot/adapter-postgres';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db, pool } = await createDatabase(url);
try {
  const org = await ensureCommunityOrganization(db, {
    slug: 'demo-community',
    name: 'RacePilot Demo',
    timezone: 'Europe/Berlin',
    locale: 'en',
  });
  await db
    .insert(events)
    .values({
      organizationId: org.id,
      slug: 'demo-event-2027',
      name: 'RacePilot Demo Event',
      startsOn: '2027-06-12',
      endsOn: '2027-06-13',
    })
    .onConflictDoNothing();
  console.log(`Seeded organization ${org.slug} and demo event`);
} finally {
  await pool.end();
}
