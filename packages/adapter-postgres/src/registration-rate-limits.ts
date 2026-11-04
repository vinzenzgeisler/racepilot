import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Database } from './database.js';
export function createPostgresRegistrationRateLimiter(
  db: Database,
  options: { now?: () => number; cleanupEvery?: number } = {},
) {
  const now = options.now ?? Date.now;
  const cleanupEvery = options.cleanupEvery ?? 256;
  let calls = 0;
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  return {
    persistence: 'shared' as const,
    consume: async (
      clientIdentity: string,
      scopes: readonly { key: string; limit: number; windowMs: number }[],
    ): Promise<{ allowed: boolean; retryAfterMs: number }> => {
      if (scopes.length === 0) return { allowed: true, retryAfterMs: 0 };
      if (
        !clientIdentity ||
        scopes.some(
          (scope) =>
            !scope.key ||
            !Number.isSafeInteger(scope.limit) ||
            scope.limit < 1 ||
            !Number.isSafeInteger(scope.windowMs) ||
            scope.windowMs < 1,
        )
      )
        throw new Error('Invalid public registration rate-limit configuration');
      const clientHash = hash(clientIdentity);
      const buckets = scopes
        .map((scope) => ({ ...scope, scopeHash: hash(scope.key) }))
        .sort((a, b) => a.scopeHash.localeCompare(b.scopeHash));
      const currentTime = now();
      return db.transaction(async (tx) => {
        for (const bucket of buckets) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`${bucket.scopeHash}:${clientHash}`}, 0))`,
          );
        }
        const prepared: Array<{
          bucket: (typeof buckets)[number];
          remaining: number;
        }> = [];
        for (const bucket of buckets) {
          const rows = (
            await tx.execute(sql`
            select remaining_tokens, updated_at
            from public_registration_rate_limit
            where scope_hash = ${bucket.scopeHash} and client_hash = ${clientHash}
            for update
          `)
          ).rows as Array<{
            remaining_tokens: number | string;
            updated_at: Date | string;
          }>;
          const prior = rows[0];
          const elapsedMs = prior
            ? Math.max(0, currentTime - new Date(prior.updated_at).getTime())
            : bucket.windowMs;
          const replenished = prior
            ? Number(prior.remaining_tokens) +
              (elapsedMs * bucket.limit) / bucket.windowMs
            : bucket.limit;
          prepared.push({
            bucket,
            remaining: Math.min(bucket.limit, replenished),
          });
        }
        const blocked = prepared.filter(({ remaining }) => remaining < 1);
        if (blocked.length) {
          return {
            allowed: false,
            retryAfterMs: Math.max(
              ...blocked.map(({ bucket, remaining }) =>
                Math.max(
                  1,
                  Math.ceil(((1 - remaining) * bucket.windowMs) / bucket.limit),
                ),
              ),
            ),
          };
        }
        for (const { bucket, remaining } of prepared) {
          await tx.execute(sql`
            insert into public_registration_rate_limit
              (scope_hash, client_hash, remaining_tokens, updated_at)
            values (${bucket.scopeHash}, ${clientHash}, ${remaining - 1}, to_timestamp(${currentTime} / 1000.0))
            on conflict (scope_hash, client_hash) do update
              set remaining_tokens = excluded.remaining_tokens,
                  updated_at = excluded.updated_at
          `);
        }
        if (++calls % cleanupEvery === 0) {
          await tx.execute(sql`
            delete from public_registration_rate_limit
            where updated_at < to_timestamp(${currentTime} / 1000.0) - interval '1 day'
          `);
        }
        return { allowed: true, retryAfterMs: 0 };
      });
    },
  };
}
