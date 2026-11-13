import { sql } from 'drizzle-orm';
import { deriveOrgaCodePrefix, formatOrgaCode } from '@racepilot/core';
import type { RequestContext } from '@racepilot/core';
import type { Database, TransactionDatabase } from './database.js';

export async function allocateOrgaCode(
  tx: TransactionDatabase,
  ctx: RequestContext,
  eventId: string,
): Promise<string> {
  const eventResult = await tx.execute(sql`
    SELECT slug, orga_code_prefix AS "orgaCodePrefix"
    FROM event
    WHERE organization_id = ${ctx.organizationId} AND id = ${eventId}
  `);
  const event = eventResult.rows[0] as
    { slug: string; orgaCodePrefix: string | null } | undefined;
  if (!event) throw new Error('Cannot allocate orga code for missing event');
  const prefix = deriveOrgaCodePrefix(event);
  const sequenceResult = await tx.execute(sql`
    INSERT INTO event_orga_code_sequence (organization_id, event_id, last_number)
    VALUES (${ctx.organizationId}, ${eventId}, 1)
    ON CONFLICT (organization_id, event_id)
    DO UPDATE SET last_number = event_orga_code_sequence.last_number + 1
    RETURNING last_number
  `);
  const nextNumber = sequenceResult.rows[0] as
    { last_number: string | number } | undefined;
  if (!nextNumber) throw new Error('Unable to allocate orga code sequence');
  return formatOrgaCode(prefix, BigInt(nextNumber.last_number));
}

function isTransactionDatabase(value: unknown): value is TransactionDatabase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'execute' in value &&
    typeof value.execute === 'function'
  );
}

export function withAllocatedOrgaCode<T>(
  db: Database,
  executor: unknown,
  ctx: RequestContext,
  eventId: string,
  write: (tx: TransactionDatabase, orgaCode: string) => Promise<T>,
): Promise<T> {
  if (executor !== undefined && executor !== null) {
    if (!isTransactionDatabase(executor))
      throw new Error('Unsupported database executor');
    return allocateOrgaCode(executor, ctx, eventId).then((code) =>
      write(executor, code),
    );
  }
  return db.transaction(async (tx) => {
    const code = await allocateOrgaCode(tx, ctx, eventId);
    return write(tx, code);
  });
}
