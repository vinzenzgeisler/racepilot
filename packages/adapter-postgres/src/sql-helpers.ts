import { sql, type SQL } from 'drizzle-orm';

/** `or(...)` that always yields a condition, so callers need no non-null assertion. */
export function anyOf(...conditions: [SQL, ...SQL[]]): SQL {
  return sql`(${sql.join(conditions, sql` or `)})`;
}
