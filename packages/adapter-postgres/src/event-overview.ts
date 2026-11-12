import { and, eq, sql } from 'drizzle-orm';
import type { OverviewRepository } from '@racepilot/core';
import { events, eventClasses } from './schema/organization.js';
import { entries } from './schema/entries.js';
import { invoices } from './schema/billing.js';
import type { Database } from './database.js';

const EVENT_QUERY_LIMIT = 1;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function createOverviewRepository(db: Database): OverviewRepository {
  return {
    getEventOverview: async (ctx, eventId, now) => {
      const [event] = await db
        .select({
          id: events.id,
          status: events.status,
          registrationClosesAt: events.registrationClosesAt,
          currency: sql<string>`(select currency from organization where id = ${events.organizationId})`,
        })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
            eq(events.status, 'open'),
          ),
        )
        .limit(EVENT_QUERY_LIMIT);
      if (!event) return { ok: false, error: 'event-not-found' };

      const statusCategory = sql<string>`coalesce((select workflow_status->>'category' from jsonb_array_elements(coalesce(workflow_revision.workflow->'statuses', '[]'::jsonb)) workflow_status where workflow_status->>'key' = ${entries.acceptanceStatus} limit 1), ${entries.acceptanceStatus})`;
      const [statusRows, classRows, [payments], [missingDocuments]] =
        await Promise.all([
          db
            .select({
              status: statusCategory,
              count: sql<number>`count(*)::int`,
              unverified: sql<number>`count(*) filter (where ${entries.verificationStatus} = 'unverified')::int`,
            })
            .from(entries)
            .leftJoin(
              sql`entry_workflow_revision workflow_revision`,
              sql`workflow_revision.organization_id = ${entries.organizationId} and workflow_revision.id = ${entries.workflowRevisionId}`,
            )
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.eventId, eventId),
                sql`${entries.deletedAt} is null`,
              ),
            )
            .groupBy(statusCategory),
          db
            .select({
              classId: eventClasses.id,
              name: eventClasses.name,
              capacity: eventClasses.maxParticipants,
              occupied: sql<number>`count(${entries.id})::int`,
            })
            .from(eventClasses)
            .leftJoin(
              entries,
              and(
                eq(entries.organizationId, eventClasses.organizationId),
                eq(entries.eventId, eventClasses.eventId),
                eq(entries.classId, eventClasses.id),
                sql`${entries.deletedAt} is null`,
                sql`${entries.acceptanceStatus} <> 'rejected'`,
              ),
            )
            .where(
              and(
                eq(eventClasses.organizationId, ctx.organizationId),
                eq(eventClasses.eventId, eventId),
              ),
            )
            .groupBy(eventClasses.id)
            .orderBy(eventClasses.sortOrder, eventClasses.name),
          db
            .select({
              count: sql<number>`count(*)::int`,
              amountCents: sql<number>`coalesce(sum(greatest(${invoices.totalCents} - coalesce(paid.amount, 0), 0)), 0)::int`,
            })
            .from(invoices)
            .leftJoin(
              sql`lateral (select sum(p.amount_cents)::int as amount from invoice_payment p where p.organization_id = ${invoices.organizationId} and p.invoice_id = ${invoices.id}) paid`,
              sql`true`,
            )
            .where(
              and(
                eq(invoices.organizationId, ctx.organizationId),
                eq(invoices.eventId, eventId),
                sql`${invoices.status} in ('open', 'partially_paid')`,
                sql`${invoices.totalCents} > coalesce(paid.amount, 0)`,
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(entries)
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.eventId, eventId),
                sql`${entries.deletedAt} is null`,
                sql`exists (
                select 1
                from event_entry_document_type required_type
                where required_type.organization_id = ${entries.organizationId}
                  and required_type.event_id = ${entries.eventId}
                  and required_type.enabled = true
                  and required_type.required = true
                  and not exists (
                    select 1
                    from entry_document submitted_document
                    where submitted_document.organization_id = ${entries.organizationId}
                      and submitted_document.event_id = ${entries.eventId}
                      and submitted_document.entry_id = ${entries.id}
                      and submitted_document.type_key = required_type.key
                      and submitted_document.status in ('uploaded', 'reviewed')
                  )
              )`,
              ),
            ),
        ]);
      const unverifiedCount = statusRows.reduce(
        (total, row) => total + row.unverified,
        0,
      );
      const daysUntilRegistrationCloses = event.registrationClosesAt
        ? Math.max(
            0,
            Math.ceil(
              (event.registrationClosesAt.getTime() - now.getTime()) /
                MILLISECONDS_PER_DAY,
            ),
          )
        : null;
      return {
        ok: true,
        overview: {
          eventId: event.id,
          statuses: Object.fromEntries(
            statusRows.map((row) => [row.status, row.count]),
          ),
          openPayments: {
            count: payments?.count ?? 0,
            amountCents: payments?.amountCents ?? 0,
            currency: event.currency,
          },
          classes: classRows.map((row) => ({
            classId: row.classId,
            name: row.name,
            occupied: row.occupied,
            capacity: row.capacity,
          })),
          daysUntilRegistrationCloses,
          missingDocuments: { count: missingDocuments?.count ?? 0 },
          warnings:
            unverifiedCount > 0
              ? [
                  {
                    type: 'unverified-email',
                    count: unverifiedCount,
                    filter: { verificationStatus: 'unverified', eventId },
                  },
                ]
              : [],
        },
      };
    },
  };
}
