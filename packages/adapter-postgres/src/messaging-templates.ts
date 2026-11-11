import { and, eq, isNull, or } from 'drizzle-orm';
import type {
  MessageRecipientFilter,
  MessageTemplate,
  RequestContext,
} from '@racepilot/core';
import {
  renderMessageTemplate,
  validateMessageTemplate,
} from '@racepilot/core';
import type { Database } from './database.js';
import { events } from './schema/organization.js';
import { messageTemplates } from './messaging-schema.js';
import { resolveMessageRecipients } from './messaging-recipients.js';

const DEFAULT_MESSAGE_TEMPLATE = Object.freeze({
  name: 'General update',
  subject: 'An update about {{eventName}}',
  textBody:
    'Hello {{firstName}},\n\nWe have an update to share about {{eventName}}.\n\nBest regards,\nThe event team',
});

export function createMessageTemplateRepository(db: Database) {
  return {
    preview: async (
      ctx: RequestContext,
      eventId: string,
      filter: MessageRecipientFilter,
    ) => {
      const result = await resolveMessageRecipients(db, ctx, eventId, filter);
      return result
        ? { ok: true as const, value: result }
        : {
            ok: false as const,
            error: {
              code: 'event-not-found' as const,
              message: 'Event not found',
            },
          };
    },
    listTemplates: async (ctx: RequestContext, eventId: string) => {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .limit(1);
      if (!event) return null;
      const templateScope = and(
        eq(messageTemplates.organizationId, ctx.organizationId),
        or(
          isNull(messageTemplates.eventId),
          eq(messageTemplates.eventId, eventId),
        ),
      );
      const existing = await db
        .select()
        .from(messageTemplates)
        .where(templateScope)
        .orderBy(messageTemplates.name);
      if (existing.length) return existing;
      await db
        .insert(messageTemplates)
        .values({
          organizationId: ctx.organizationId,
          eventId,
          ...DEFAULT_MESSAGE_TEMPLATE,
        })
        .onConflictDoNothing();
      return db
        .select()
        .from(messageTemplates)
        .where(templateScope)
        .orderBy(messageTemplates.name);
    },
    saveTemplate: async (ctx: RequestContext, input: MessageTemplate) => {
      if (validateMessageTemplate(input.subject, input.text).length)
        return null;
      if (input.eventId) {
        const [event] = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, input.eventId),
            ),
          )
          .limit(1);
        if (!event) return null;
      }
      const values = {
        organizationId: ctx.organizationId,
        eventId: input.eventId,
        name: input.name,
        subject: input.subject,
        textBody: input.text,
        updatedAt: new Date(),
      };
      if (!input.id) {
        const [created] = await db
          .insert(messageTemplates)
          .values(values)
          .returning();
        return created ?? null;
      }
      const [updated] = await db
        .update(messageTemplates)
        .set(values)
        .where(
          and(
            eq(messageTemplates.organizationId, ctx.organizationId),
            eq(messageTemplates.id, input.id),
          ),
        )
        .returning();
      return updated ?? null;
    },
    previewTemplate: async (
      ctx: RequestContext,
      eventId: string,
      filter: MessageRecipientFilter,
      subject: string,
      text: string,
    ) => {
      const result = await resolveMessageRecipients(db, ctx, eventId, filter);
      if (!result)
        return {
          ok: false as const,
          error: {
            code: 'event-not-found' as const,
            message: 'Event not found',
          },
        };
      if (!result.recipients.length)
        return {
          ok: false as const,
          error: {
            code: 'no-recipients' as const,
            message: 'No example recipient matches the selection',
          },
        };
      const errors = validateMessageTemplate(subject, text);
      if (errors.length)
        return {
          ok: false as const,
          error: {
            code: 'invalid-template' as const,
            message: 'Message template is invalid',
            details: errors,
          },
        };
      const [recipient] = result.recipients;
      if (!recipient)
        return {
          ok: false as const,
          error: {
            code: 'no-recipients' as const,
            message: 'No example recipient matches the selection',
          },
        };
      const rendered = renderMessageTemplate(subject, text, {
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        fullName: recipient.fullName,
        email: recipient.email,
        eventName: recipient.eventName,
        className: recipient.className,
        entryNumber: recipient.entryNumber,
      });
      if (!rendered.ok)
        return {
          ok: false as const,
          error: {
            code: 'invalid-template' as const,
            message: 'Message template is invalid',
            details: rendered.errors,
          },
        };
      return {
        ok: true as const,
        value: {
          recipient: { email: recipient.email, name: recipient.name },
          ...rendered.value,
        },
      };
    },
  };
}
