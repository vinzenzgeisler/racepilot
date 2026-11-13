import { organizationId, resolveCanonicalOrigin } from '@racepilot/core';
import type { CanonicalOrigin } from '@racepilot/core';
import type {
  JobContext,
  MailProvider,
  MailAttachment,
  ObjectStorageProvider,
  MailAttachmentReference,
} from '@racepilot/core';
import { JobEnvelope, MESSAGE_ATTACHMENT_LIMITS } from '@racepilot/contracts';
import { createJobContext } from './index.js';

export const mailTemplateContracts = {
  verification: ['recipientName', 'verificationUrl'],
  'registration-resume': ['recipientName', 'resumeUrl'],
  'entry-received': ['recipientName', 'eventName'],
  accepted: ['recipientName', 'eventName'],
  rejected: ['recipientName', 'eventName'],
  'status-change': [
    'recipientName',
    'eventName',
    'statusKey',
    'statusLabelDe',
    'statusLabelEn',
    'driverNote',
  ],
  'message-campaign': ['subject', 'body'],
  'passenger-link': ['recipientName', 'driverName', 'eventName', 'linkUrl'],
} as const;
export type MailTemplateKey = keyof typeof mailTemplateContracts;
export type MailLocale = 'de' | 'en';
export interface MailTemplate {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}
const defaultCopy: Record<MailTemplateKey, Record<MailLocale, MailTemplate>> = {
  verification: {
    de: {
      subject: 'Bitte bestätige deine E-Mail-Adresse',
      text: 'Hallo {{recipientName}}, bestätige deine E-Mail-Adresse: {{verificationUrl}}',
      html: '<p>Hallo {{recipientName}},</p><p><a href="{{verificationUrl}}">E-Mail-Adresse bestätigen</a></p>',
    },
    en: {
      subject: 'Verify your email address',
      text: 'Hello {{recipientName}}, verify your email address: {{verificationUrl}}',
      html: '<p>Hello {{recipientName}},</p><p><a href="{{verificationUrl}}">Verify your email address</a></p>',
    },
  },
  'registration-resume': {
    de: {
      subject: 'Setze deine Nennung fort',
      text: 'Hallo {{recipientName}}, hier kannst du deine Nennung sicher fortsetzen: {{resumeUrl}}',
      html: '<p>Hallo {{recipientName}},</p><p><a href="{{resumeUrl}}">Nennung fortsetzen</a></p><p>Der Link ist zeitlich begrenzt und funktioniert nur einmal.</p>',
    },
    en: {
      subject: 'Continue your registration',
      text: 'Hello {{recipientName}}, continue your registration securely: {{resumeUrl}}',
      html: '<p>Hello {{recipientName}},</p><p><a href="{{resumeUrl}}">Continue registration</a></p><p>This link expires and can only be used once.</p>',
    },
  },
  'entry-received': {
    de: {
      subject: 'Nennung eingegangen: {{eventName}}',
      text: 'Hallo {{recipientName}}, deine Nennung für {{eventName}} ist eingegangen.',
      html: '<p>Hallo {{recipientName}}, deine Nennung für {{eventName}} ist eingegangen.</p>',
    },
    en: {
      subject: 'Entry received: {{eventName}}',
      text: 'Hello {{recipientName}}, your entry for {{eventName}} was received.',
      html: '<p>Hello {{recipientName}}, your entry for {{eventName}} was received.</p>',
    },
  },
  accepted: {
    de: {
      subject: 'Nennung angenommen: {{eventName}}',
      text: 'Hallo {{recipientName}}, deine Nennung für {{eventName}} wurde angenommen.',
      html: '<p>Hallo {{recipientName}}, deine Nennung für {{eventName}} wurde angenommen.</p>',
    },
    en: {
      subject: 'Entry accepted: {{eventName}}',
      text: 'Hello {{recipientName}}, your entry for {{eventName}} was accepted.',
      html: '<p>Hello {{recipientName}}, your entry for {{eventName}} was accepted.</p>',
    },
  },
  'status-change': {
    de: {
      subject: 'Neuer Nennungsstatus: {{eventName}}',
      text: 'Hallo {{recipientName}}, der Status deiner Nennung für {{eventName}} ist jetzt {{statusLabelDe}} ({{statusKey}}). {{driverNote}}',
      html: '<p>Hallo {{recipientName}},</p><p>Der Status deiner Nennung für {{eventName}} ist jetzt {{statusLabelDe}} (<code>{{statusKey}}</code>).</p><p>{{driverNote}}</p>',
    },
    en: {
      subject: 'Entry status updated: {{eventName}}',
      text: 'Hello {{recipientName}}, your entry status for {{eventName}} is now {{statusLabelEn}} ({{statusKey}}). {{driverNote}}',
      html: '<p>Hello {{recipientName}},</p><p>Your entry status for {{eventName}} is now {{statusLabelEn}} (<code>{{statusKey}}</code>).</p><p>{{driverNote}}</p>',
    },
  },
  'message-campaign': {
    de: { subject: '{{subject}}', text: '{{body}}', html: '<p>{{body}}</p>' },
    en: { subject: '{{subject}}', text: '{{body}}', html: '<p>{{body}}</p>' },
  },
  'passenger-link': {
    de: {
      subject: 'Deine Daten als Beifahrer: {{eventName}}',
      text: 'Hallo {{recipientName}}, {{driverName}} hat dich als Beifahrer für {{eventName}} gemeldet. Bitte ergänze deine Daten und Einwilligungen über deinen persönlichen Link: {{linkUrl}} Der Link ist zeitlich begrenzt und funktioniert nur einmal.',
      html: '<p>Hallo {{recipientName}},</p><p>{{driverName}} hat dich als Beifahrer für {{eventName}} gemeldet. Bitte ergänze deine Daten und Einwilligungen:</p><p><a href="{{linkUrl}}">Daten ergänzen</a></p><p>Der Link ist zeitlich begrenzt und funktioniert nur einmal.</p>',
    },
    en: {
      subject: 'Your details as co-driver: {{eventName}}',
      text: 'Hello {{recipientName}}, {{driverName}} named you as co-driver for {{eventName}}. Please complete your details and consents with your personal link: {{linkUrl}} The link expires and can only be used once.',
      html: '<p>Hello {{recipientName}},</p><p>{{driverName}} named you as co-driver for {{eventName}}. Please complete your details and consents:</p><p><a href="{{linkUrl}}">Complete details</a></p><p>The link expires and can only be used once.</p>',
    },
  },
  rejected: {
    de: {
      subject: 'Nennung abgelehnt: {{eventName}}',
      text: 'Hallo {{recipientName}}, deine Nennung für {{eventName}} wurde abgelehnt.',
      html: '<p>Hallo {{recipientName}}, deine Nennung für {{eventName}} wurde abgelehnt.</p>',
    },
    en: {
      subject: 'Entry declined: {{eventName}}',
      text: 'Hello {{recipientName}}, your entry for {{eventName}} was declined.',
      html: '<p>Hello {{recipientName}}, your entry for {{eventName}} was declined.</p>',
    },
  },
};
export function renderMailTemplate(
  template: MailTemplate,
  key: MailTemplateKey,
  values: Record<string, string>,
): MailTemplate {
  const allowed = new Set<string>(mailTemplateContracts[key]);
  for (const part of [template.subject, template.text, template.html]) {
    for (const match of part.matchAll(/{{\s*([^{}]+?)\s*}}/g))
      if (!allowed.has(match[1]!))
        throw new Error('Unknown mail template placeholder');
  }
  for (const name of allowed)
    if (!(name in values)) throw new Error('Missing mail template placeholder');
  const replace = (input: string, escape: boolean) =>
    input.replace(/{{\s*([^{}]+?)\s*}}/g, (_m, name: string) => {
      if (!allowed.has(name))
        throw new Error('Unknown mail template placeholder');
      const value = values[name];
      if (value === undefined)
        throw new Error('Missing mail template placeholder');
      return escape
        ? value.replace(
            /[&<>"']/g,
            (c) =>
              ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
              })[c]!,
          )
        : value;
    });
  return {
    subject: replace(template.subject, false),
    text: replace(template.text, false),
    html: replace(template.html, true),
  };
}
export function defaultMailTemplate(
  key: MailTemplateKey,
  locale: MailLocale,
): MailTemplate {
  return defaultCopy[key][locale];
}

export interface MailOutboxRecord {
  id: string;
  organizationId: string;
  eventId: string | null;
  templateKey: MailTemplateKey;
  templateVersion: number;
  locale: MailLocale;
  recipient: string;
  idempotencyKey: string;
  variables: Record<string, string>;
  attachmentRefs?: readonly MailAttachmentReference[];
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  attachments?: readonly MailAttachment[];
}
export interface MailOutboxRepository {
  get(ctx: JobContext, id: string): Promise<MailOutboxRecord | null>;
  claim(ctx: JobContext, id: string): Promise<MailOutboxRecord | null>;
  template(
    ctx: JobContext,
    key: MailTemplateKey,
    version: number,
    locale: MailLocale,
  ): Promise<MailTemplate | null>;
  organizationMailConfig(
    ctx: JobContext,
  ): Promise<{ from: string; replyTo: string | null } | null>;
  finish(
    ctx: JobContext,
    id: string,
    result: {
      outcome: 'sent' | 'retry' | 'failed';
      attempts: number;
      availableAt?: Date;
      error?: string;
    },
  ): Promise<void>;
}
export async function processMailOutboxJob(input: {
  ctx: JobContext;
  outboxId: string;
  deps: {
    repository: MailOutboxRepository;
    mail: MailProvider;
    now?: () => Date;
    maxAttempts?: number;
  };
}): Promise<void> {
  const { ctx, deps } = input;
  const row = await deps.repository.get(ctx, input.outboxId);
  if (!row || row.organizationId !== ctx.organizationId) {
    console.warn('Mail outbox job references an unavailable tenant row', {
      outboxId: input.outboxId,
      organizationId: ctx.organizationId,
    });
    return;
  }
  if (row.status === 'sent' || row.status === 'failed') return;
  const claimed = await deps.repository.claim(ctx, row.id);
  if (!claimed) return;
  const attempts = claimed.attempts + 1;
  try {
    const [config, override] = await Promise.all([
      deps.repository.organizationMailConfig(ctx),
      deps.repository.template(
        ctx,
        claimed.templateKey,
        claimed.templateVersion,
        claimed.locale,
      ),
    ]);
    if (!config) throw new Error('Organization mail configuration unavailable');
    const template =
      override ?? defaultMailTemplate(claimed.templateKey, claimed.locale);
    const rendered = renderMailTemplate(
      template,
      claimed.templateKey,
      claimed.variables,
    );
    await deps.mail.send({
      organizationId: ctx.organizationId,
      to: claimed.recipient,
      from: config.from,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      ...rendered,
      idempotencyKey: claimed.idempotencyKey,
      ...(claimed.attachments?.length
        ? { attachments: claimed.attachments }
        : {}),
    });
    await deps.repository.finish(ctx, claimed.id, {
      outcome: 'sent',
      attempts,
    });
  } catch (error) {
    const max = deps.maxAttempts ?? 5;
    const now = (deps.now ?? (() => new Date()))();
    const terminal = attempts >= max;
    const delayMs = Math.min(60 * 60_000, 30_000 * 2 ** (attempts - 1));
    await deps.repository.finish(ctx, claimed.id, {
      outcome: terminal ? 'failed' : 'retry',
      attempts,
      ...(!terminal ? { availableAt: new Date(now.getTime() + delayMs) } : {}),
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'Mail delivery failed',
    });
    // The retry is persisted in Graphile in the same transaction as this status update.
  }
}

/** Graphile Worker task: only a validated envelope can create a tenant JobContext. */
export function createMailOutboxTask(deps: {
  deploymentMode: 'community' | 'cloud';
  communityOrganizationId?: string;
  getOrganization(id: string): Promise<{ status: string } | null>;
  repository: MailOutboxRepository;
  mail: MailProvider;
  canonicalOrigin: CanonicalOrigin;
  storage?: ObjectStorageProvider;
}) {
  return async (payload: unknown, helpers: { job: { id: string } }) => {
    let envelope: ReturnType<typeof JobEnvelope.parse>;
    try {
      envelope = JobEnvelope.parse(payload);
    } catch {
      console.warn('Ignoring invalid mail outbox job envelope');
      return;
    }
    if (
      envelope.type !== 'mail.outbox' ||
      typeof envelope.payload !== 'object' ||
      envelope.payload === null ||
      !('outboxId' in envelope.payload) ||
      typeof envelope.payload.outboxId !== 'string'
    ) {
      console.warn('Ignoring invalid mail outbox job payload');
      return;
    }
    let ctx: JobContext;
    try {
      ctx = await createJobContext(envelope, {
        deploymentMode: deps.deploymentMode,
        ...(deps.communityOrganizationId
          ? { communityOrganizationId: deps.communityOrganizationId }
          : {}),
        getOrganization: deps.getOrganization,
        jobId: helpers.job.id,
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'Organization unavailable'
      )
        throw error;
      console.warn('Ignoring mail outbox job for unavailable organization', {
        organizationId: envelope.organizationId,
      });
      return;
    }
    const row = await deps.repository.get(ctx, envelope.payload.outboxId);
    if (!row || row.organizationId !== ctx.organizationId) {
      console.warn('Ignoring mail outbox job with unavailable row', {
        outboxId: envelope.payload.outboxId,
        organizationId: ctx.organizationId,
      });
      return;
    }
    const variables = { ...row.variables };
    const attachmentReferences = row.attachmentRefs ?? [];
    const expectsAttachments = attachmentReferences.length > 0;
    if (
      row.templateKey === 'message-campaign' &&
      expectsAttachments &&
      !deps.storage
    )
      throw new Error('Message attachment storage is unavailable');
    const attachments =
      row.templateKey === 'message-campaign' &&
      expectsAttachments &&
      deps.storage
        ? await loadMessageAttachments(
            deps.storage,
            ctx.organizationId,
            attachmentReferences,
          )
        : [];
    const linkVariable = {
      verification: 'verificationUrl',
      'registration-resume': 'resumeUrl',
      'passenger-link': 'linkUrl',
    }[row.templateKey as string];
    if (linkVariable) {
      const variableName = linkVariable;
      const origin = await resolveCanonicalOrigin(deps.canonicalOrigin, ctx);
      if (!origin) throw new Error('Canonical origin is unavailable');
      const url = new URL(variables[variableName] ?? '/', origin);
      if (url.origin !== origin)
        throw new Error(
          'Verification URL must use the configured canonical origin',
        );
      variables[variableName] = url.href;
    }
    await processMailOutboxJob({
      ctx,
      outboxId: row.id,
      deps: {
        repository: {
          ...deps.repository,
          get: async () => ({ ...row, variables, attachments }),
          claim: async () => {
            const claimed = await deps.repository.claim(ctx, row.id);
            return claimed ? { ...claimed, variables, attachments } : null;
          },
        },
        mail: deps.mail,
      },
    });
  };
}

async function loadMessageAttachments(
  storage: ObjectStorageProvider,
  tenantId: string,
  references: readonly MailAttachmentReference[],
): Promise<MailAttachment[]> {
  if (!references.length) return [];
  let refs: Array<{ objectId: string; filename: string }>;
  try {
    const parsed: unknown = references;
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'objectId' in item &&
          typeof item.objectId === 'string' &&
          'filename' in item &&
          typeof item.filename === 'string',
      )
    )
      throw new Error('Invalid attachment references');
    if (parsed.length > MESSAGE_ATTACHMENT_LIMITS.maxCount)
      throw new Error('Too many message attachments');
    refs = parsed;
  } catch {
    throw new Error('Invalid message attachment references');
  }
  const attachments: MailAttachment[] = [];
  let totalBytes = 0;
  for (const ref of refs) {
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.pdf$/i.test(ref.filename))
      throw new Error('Invalid message attachment filename');
    const object = await storage.get(organizationId(tenantId), ref.objectId);
    if (!object || object.ref.contentType !== 'application/pdf')
      throw new Error('Message attachment is unavailable');
    totalBytes += object.ref.size;
    if (totalBytes > MESSAGE_ATTACHMENT_LIMITS.maxBytes)
      throw new Error('Message attachments exceed the configured size limit');
    attachments.push({
      filename: ref.filename,
      contentType: object.ref.contentType,
      content: object.body,
    });
  }
  return attachments;
}
