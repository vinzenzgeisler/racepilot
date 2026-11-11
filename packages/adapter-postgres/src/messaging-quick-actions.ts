import type { RequestContext } from '@racepilot/core';
import { createMessageSender } from './messaging-send.js';
import { messageCampaignDelivery } from '@racepilot/core';
import type { Database } from './database.js';

export type MessageQuickAction = 'resend-verification' | 'remind-open-payments';

export function createMessageQuickActions(
  db: Database,
  canonicalBaseUrl: string | undefined,
) {
  const send = createMessageSender(db, undefined, canonicalBaseUrl);
  return async (
    ctx: RequestContext,
    eventId: string,
    action: MessageQuickAction,
    actor: string,
  ) => {
    if (action === 'resend-verification' && !canonicalBaseUrl)
      return {
        ok: false as const,
        error: {
          code: 'verification-unavailable' as const,
          message: 'Registration verification is unavailable',
        },
      };
    const input =
      action === 'resend-verification'
        ? {
            eventId,
            recipients: {
              classIds: [],
              statuses: [],
              emailVerified: false as const,
              payment: 'any' as const,
              entryIds: [],
              additionalAddresses: [],
            },
            subject: 'Verify your email address',
            text: 'Follow the verification link to confirm your email address.',
            attachments: [],
          }
        : {
            eventId,
            recipients: {
              classIds: [],
              statuses: [],
              payment: 'open' as const,
              entryIds: [],
              additionalAddresses: [],
            },
            subject: 'Payment reminder for {{eventName}}',
            text: 'This is a reminder that a payment for {{eventName}} is still open. Please review your payment details.',
            attachments: [],
          };
    return send(
      ctx,
      eventId,
      `quick-action:${action}:${crypto.randomUUID()}`,
      input,
      actor,
      action === 'resend-verification'
        ? {
            auditAction: action,
            validateRecipients: (recipients) =>
              canonicalBaseUrl &&
              recipients.every((recipient) => recipient.registrationGroupId)
                ? { ok: true as const }
                : {
                    ok: false as const,
                    error: {
                      code: 'verification-unavailable' as const,
                      message: 'Registration verification is unavailable',
                    },
                  },
            enqueue: async (tx, value) => {
              const recipient = await tx.enqueueVerificationRecipient(value);
              return recipient
                ? { ok: true as const, recipient }
                : {
                    ok: false as const,
                    error: {
                      code: 'verification-unavailable' as const,
                      message: 'Registration verification is unavailable',
                    },
                  };
            },
          }
        : { ...messageCampaignDelivery(), auditAction: action },
    );
  };
}
