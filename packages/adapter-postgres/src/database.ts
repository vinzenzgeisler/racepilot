import { drizzle } from 'drizzle-orm/node-postgres';

export type Database = ReturnType<typeof drizzle>;

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
