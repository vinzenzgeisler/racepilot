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

export function createMessageTemplateRepository(db: Database) {
  return {
    preview: (
      ctx: RequestContext,
      eventId: string,
      filter: MessageRecipientFilter,
    ) => resolveMessageRecipients(db, ctx, eventId, filter),
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
      return db
        .select()
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.organizationId, ctx.organizationId),
            or(
              isNull(messageTemplates.eventId),
              eq(messageTemplates.eventId, eventId),
            ),
          ),
        )
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
      if (
        !result ||
        !result.recipients.length ||
        validateMessageTemplate(subject, text).length
      )
        return null;
      const recipient = result.recipients[0]!;
      return {
        recipient: { email: recipient.email, name: recipient.name },
        ...renderMessageTemplate(subject, text, {
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          fullName: recipient.fullName,
          email: recipient.email,
          eventName: recipient.eventName,
          className: recipient.className,
          entryNumber: recipient.entryNumber,
        }),
      };
    },
  };
}
