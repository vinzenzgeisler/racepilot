import { and, eq, inArray } from 'drizzle-orm';
import type { RequestContext } from '@racepilot/core';
import type { Database } from './database.js';
import { entryPassengerLinks, entryPassengers } from './schema/passengers.js';

export interface PassengerHistoryItem {
  entryId: string;
  id: string;
  label: 'passenger_added' | 'passenger_completed' | 'passenger_link_created';
  actor: string;
  occurredAt: Date;
  detail: string;
}

/** What happened around the co-driver of the given entries: added, link created, completed. */
export async function loadPassengerHistory(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  entryIds: string[],
): Promise<PassengerHistoryItem[]> {
  const [passengers, links] = await Promise.all([
    db
      .select()
      .from(entryPassengers)
      .where(
        and(
          eq(entryPassengers.organizationId, ctx.organizationId),
          inArray(entryPassengers.entryId, entryIds),
        ),
      ),
    db
      .select({
        entryId: entryPassengers.entryId,
        id: entryPassengerLinks.id,
        actor: entryPassengerLinks.createdBy,
        createdAt: entryPassengerLinks.createdAt,
      })
      .from(entryPassengerLinks)
      .innerJoin(
        entryPassengers,
        and(
          eq(
            entryPassengers.organizationId,
            entryPassengerLinks.organizationId,
          ),
          eq(entryPassengers.id, entryPassengerLinks.passengerId),
        ),
      )
      .where(
        and(
          eq(entryPassengerLinks.organizationId, ctx.organizationId),
          inArray(entryPassengers.entryId, entryIds),
        ),
      ),
  ]);
  return [
    ...passengers.flatMap((row): PassengerHistoryItem[] => [
      {
        entryId: row.entryId,
        id: `${row.id}:added`,
        label: 'passenger_added',
        actor: row.createdBy,
        occurredAt: row.createdAt,
        detail: `${row.firstName} ${row.lastName}`,
      },
      ...(row.completedAt
        ? [
            {
              entryId: row.entryId,
              id: `${row.id}:completed`,
              label: 'passenger_completed' as const,
              actor: `${row.firstName} ${row.lastName}`,
              occurredAt: row.completedAt,
              detail: '',
            },
          ]
        : []),
    ]),
    ...links.map((row): PassengerHistoryItem => ({
      entryId: row.entryId,
      id: row.id,
      label: 'passenger_link_created',
      actor: row.actor,
      occurredAt: row.createdAt,
      detail: '',
    })),
  ];
}
