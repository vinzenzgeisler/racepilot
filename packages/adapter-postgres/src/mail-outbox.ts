import type { Database } from './database.js';

import { sql } from 'drizzle-orm';

import { eq, and, or, lt, lte } from 'drizzle-orm';

import { organizations } from './schema/organization.js';

import {
  emailOutbox,
  emailTemplateVersions,
  emailDeliveries,
} from './mail-schema.js';

export type MailOutboxExecutor = Pick<
  Database,
  'execute' | 'insert' | 'select'
>;

export interface NewMailOutboxMessage {
  eventId?: string | null;
  registrationGroupId?: string | null;
  templateKey: string;
  templateVersion: number;
  templateVersionId?: string | null;
  locale: 'de' | 'en';
  recipient: string;
  idempotencyKey: string;
  variables: Record<string, string>;
  correlationId?: string;
}

export async function enqueueMailOutbox(
  db: Database,
  organization: string,
  input: NewMailOutboxMessage,
  executor: MailOutboxExecutor = db,
): Promise<string> {
  const [inserted] = await executor
    .insert(emailOutbox)
    .values({
      organizationId: organization,
      eventId: input.eventId ?? null,
      registrationGroupId: input.registrationGroupId ?? null,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      templateVersionId: input.templateVersionId ?? null,
      locale: input.locale,
      recipient: input.recipient,
      idempotencyKey: input.idempotencyKey,
      variables: input.variables,
    })
    .onConflictDoNothing({
      target: [emailOutbox.organizationId, emailOutbox.idempotencyKey],
    })
    .returning({ id: emailOutbox.id });
  if (inserted) {
    const envelope = {
      type: 'mail.outbox',
      schemaVersion: 1,
      organizationId: organization,
      correlationId: input.correlationId ?? input.idempotencyKey,
      payload: { outboxId: inserted.id },
    };
    await executor.execute(
      sql`select graphile_worker.add_job('mail_outbox', ${JSON.stringify(envelope)}::json, null, now(), 25, ${`mail-outbox:${inserted.id}`})`,
    );
    return inserted.id;
  }
  const [existing] = await executor
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.organizationId, organization),
        eq(emailOutbox.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error('Mail outbox enqueue failed');
  return existing.id;
}

export function createMailOutboxRepository(
  db: Database,
  options: { leaseMs?: number } = {},
) {
  const leaseMs = options.leaseMs ?? 5 * 60_000;
  const mapOutbox = (row: typeof emailOutbox.$inferSelect) => ({
    id: row.id,
    organizationId: row.organizationId,
    eventId: row.eventId,
    templateKey: row.templateKey as
      | 'verification'
      | 'registration-resume'
      | 'entry-received'
      | 'accepted'
      | 'rejected'
      | 'status-change'
      | 'message-campaign',
    templateVersion: row.templateVersion,
    locale: row.locale as 'de' | 'en',
    recipient: row.recipient,
    idempotencyKey: row.idempotencyKey,
    variables: row.variables,
    status: row.status as 'pending' | 'sending' | 'sent' | 'failed',
    attempts: row.attempts,
  });
  return {
    get: async (ctx: { organizationId: string }, id: string) => {
      const [row] = await db
        .select()
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.organizationId, ctx.organizationId),
            eq(emailOutbox.id, id),
          ),
        )
        .limit(1);
      return row ? mapOutbox(row) : null;
    },
    claim: async (ctx: { organizationId: string }, id: string) => {
      const [row] = await db
        .update(emailOutbox)
        .set({ status: 'sending', claimedAt: new Date() })
        .where(
          and(
            eq(emailOutbox.organizationId, ctx.organizationId),
            eq(emailOutbox.id, id),
            or(
              and(
                eq(emailOutbox.status, 'pending'),
                lte(emailOutbox.availableAt, sql`now()`),
              ),
              and(
                eq(emailOutbox.status, 'sending'),
                lt(
                  emailOutbox.claimedAt,
                  sql`now() - (${leaseMs} * interval '1 millisecond')`,
                ),
              ),
            ),
          ),
        )
        .returning();
      return row ? mapOutbox(row) : null;
    },
    template: async (
      ctx: { organizationId: string },
      key: string,
      version: number,
      locale: string,
    ) => {
      const [row] = await db
        .select({
          subject: emailTemplateVersions.subject,
          text: emailTemplateVersions.textBody,
          html: emailTemplateVersions.htmlBody,
        })
        .from(emailTemplateVersions)
        .where(
          and(
            eq(emailTemplateVersions.organizationId, ctx.organizationId),
            eq(emailTemplateVersions.templateKey, key),
            eq(emailTemplateVersions.version, version),
            eq(emailTemplateVersions.locale, locale),
          ),
        )
        .limit(1);
      return row
        ? { subject: row.subject, text: row.text, html: row.html }
        : null;
    },
    organizationMailConfig: async (ctx: { organizationId: string }) => {
      const [row] = await db
        .select({
          from: organizations.mailFrom,
          replyTo: organizations.mailReplyTo,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, ctx.organizationId),
            eq(organizations.status, 'active'),
          ),
        )
        .limit(1);
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return row?.from &&
        email.test(row.from) &&
        (row.replyTo === null ||
          (row.replyTo !== null && email.test(row.replyTo)))
        ? { from: row.from, replyTo: row.replyTo }
        : null;
    },
    finish: async (
      ctx: { organizationId: string },
      id: string,
      outcome: {
        outcome: 'sent' | 'retry' | 'failed';
        attempts: number;
        availableAt?: Date;
        error?: string;
      },
    ) => {
      await db.transaction(async (tx) => {
        await tx
          .update(emailOutbox)
          .set({
            status: outcome.outcome === 'retry' ? 'pending' : outcome.outcome,
            attempts: outcome.attempts,
            availableAt: outcome.availableAt ?? new Date(),
            sentAt: outcome.outcome === 'sent' ? new Date() : null,
            claimedAt: null,
            lastError: outcome.error ?? null,
          })
          .where(
            and(
              eq(emailOutbox.organizationId, ctx.organizationId),
              eq(emailOutbox.id, id),
              eq(emailOutbox.status, 'sending'),
            ),
          );
        await tx.execute(sql`update message_campaign_recipient
          set status = case
            when ${outcome.outcome} = 'sent' then 'sent'
            when ${outcome.outcome} = 'failed' then 'failed'
            else 'planned'
          end
          where organization_id = ${ctx.organizationId} and outbox_id = ${id}`);
        await tx.execute(sql`update message_campaign c
          set status = case
            when exists (select 1 from message_campaign_recipient r where r.organization_id = c.organization_id and r.campaign_id = c.id and r.status in ('planned','sending')) then 'sending'
            when exists (select 1 from message_campaign_recipient r where r.organization_id = c.organization_id and r.campaign_id = c.id and r.status = 'failed') then 'failed'
            else 'sent'
          end
          where c.organization_id = ${ctx.organizationId}
            and exists (select 1 from message_campaign_recipient r where r.organization_id = c.organization_id and r.campaign_id = c.id and r.outbox_id = ${id})`);
        await tx
          .insert(emailDeliveries)
          .values({
            organizationId: ctx.organizationId,
            outboxId: id,
            attempt: outcome.attempts,
            outcome: outcome.outcome,
            error: outcome.error ?? null,
          })
          .onConflictDoNothing();
        if (outcome.outcome === 'retry' && outcome.availableAt) {
          const envelope = {
            type: 'mail.outbox',
            schemaVersion: 1,
            organizationId: ctx.organizationId,
            correlationId: id,
            payload: { outboxId: id },
          };
          await tx.execute(sql`select graphile_worker.add_job(
            identifier := 'mail_outbox',
            payload := ${JSON.stringify(envelope)}::json,
            run_at := ${outcome.availableAt},
            job_key := ${`mail-outbox:${id}`},
            job_key_mode := 'replace'
          )`);
        }
      });
    },
  };
}
