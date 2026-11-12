import {
  people,
  registrationGroups,
  entries,
  entryAuditEvents,
} from './schema/entries.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { organizations, events } from './schema/organization.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import { projectEntryRows } from './entry-projection.js';
import type { Database } from './database.js';
import type { EntryRepository } from '@racepilot/core';
import { attachAdminEntryDetails } from './entry-admin-details.js';

export function createEntryTransitionMethod(
  db: Database,
): Required<Pick<EntryRepository, 'transition'>> {
  return {
    transition: async (
      ctx,
      id,
      transition,
      fromStatus,
      toStatus,
      actor,
      reason,
      workflow,
    ) =>
      db.transaction(async (tx) => {
        const statusColumn =
          transition === 'verification'
            ? entries.verificationStatus
            : entries.acceptanceStatus;
        const [row] = await tx
          .update(entries)
          .set({
            [transition === 'verification'
              ? 'verificationStatus'
              : 'acceptanceStatus']: toStatus,
          })
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, id),
              eq(statusColumn, fromStatus),
              sql`${entries.deletedAt} is null`,
            ),
          )
          .returning();
        if (!row) return null;
        await tx.insert(entryAuditEvents).values({
          organizationId: ctx.organizationId,
          entryId: id,
          transition,
          fromStatus,
          toStatus,
          actor,
          reason,
          workflowRevisionId:
            workflow?.workflowRevisionId ?? row.workflowRevisionId!,
          ...(workflow ? { statusCategory: workflow.statusCategory } : {}),
        });
        if (transition === 'acceptance' && workflow?.notification) {
          const [recipient] = await tx
            .select({
              email: sql<
                string | null
              >`coalesce(${registrationGroups.contactEmail}, ${people.email})`,
              recipientName: sql<string>`concat_ws(' ', ${people.firstName}, ${people.lastName})`,
              eventName: events.name,
              orgaCode: entries.orgaCode,
              locale: organizations.locale,
            })
            .from(entries)
            .innerJoin(
              events,
              and(
                eq(events.id, entries.eventId),
                eq(events.organizationId, entries.organizationId),
              ),
            )
            .innerJoin(
              organizations,
              eq(organizations.id, entries.organizationId),
            )
            .innerJoin(
              people,
              and(
                eq(people.id, entries.driverPersonId),
                eq(people.organizationId, entries.organizationId),
              ),
            )
            .innerJoin(
              registrationGroups,
              and(
                eq(registrationGroups.id, entries.registrationGroupId),
                eq(registrationGroups.organizationId, entries.organizationId),
              ),
            )
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.id, id),
              ),
            )
            .limit(1);
          if (recipient?.email) {
            await enqueueMailOutbox(
              db,
              ctx.organizationId,
              {
                eventId: row.eventId,
                registrationGroupId: row.registrationGroupId,
                templateKey: 'status-change',
                templateVersion: 1,
                locale: recipient.locale === 'en' ? 'en' : 'de',
                recipient: recipient.email,
                idempotencyKey: `entry-status:${id}:${workflow.workflowRevisionId}:${fromStatus}:${toStatus}`,
                correlationId: ctx.correlationId,
                variables: {
                  recipientName: recipient.recipientName,
                  eventName: recipient.eventName,
                  orgaCode: recipient.orgaCode,
                  statusKey: workflow.notification.statusKey,
                  statusLabelDe: workflow.notification.statusLabelDe,
                  statusLabelEn: workflow.notification.statusLabelEn,
                },
              },
              tx,
            );
          }
        }
        // Return the same read model as entry detail, including the audit just written.
        const projected = await projectEntryRows(tx, ctx, [row]);
        return (await attachAdminEntryDetails(tx, ctx, projected))[0] ?? null;
      }),
  };
}
