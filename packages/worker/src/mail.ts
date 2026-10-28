import type { JobContext, MailProvider } from '@racepilot/core';
import { JobEnvelope } from '@racepilot/contracts';
import { createJobContext } from './index.js';

export const mailTemplateContracts = {
  verification: ['recipientName', 'verificationUrl'],
  'entry-received': ['recipientName', 'eventName'],
  accepted: ['recipientName', 'eventName'],
  rejected: ['recipientName', 'eventName'],
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
    for (const match of part.matchAll(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g))
      if (!allowed.has(match[1]!))
        throw new Error('Unknown mail template placeholder');
  }
  for (const name of allowed)
    if (!(name in values)) throw new Error('Missing mail template placeholder');
  const replace = (input: string, escape: boolean) =>
    input.replace(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g, (_m, name: string) => {
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
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
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
  if (!row || row.organizationId !== ctx.organizationId)
    throw new Error('Mail outbox unavailable');
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
    if (!terminal) throw error;
  }
}

/** Graphile Worker task: only a validated envelope can create a tenant JobContext. */
export function createMailOutboxTask(deps: {
  deploymentMode: 'community' | 'cloud';
  communityOrganizationId?: string;
  getOrganization(id: string): Promise<{ status: string } | null>;
  repository: MailOutboxRepository;
  mail: MailProvider;
  canonicalBaseUrl: string;
}) {
  return async (payload: unknown, helpers: { job: { id: string } }) => {
    const envelope = JobEnvelope.parse(payload);
    if (
      envelope.type !== 'mail.outbox' ||
      typeof envelope.payload !== 'object' ||
      envelope.payload === null ||
      !('outboxId' in envelope.payload) ||
      typeof envelope.payload.outboxId !== 'string'
    )
      throw new Error('Invalid mail outbox job');
    const ctx = await createJobContext(envelope, {
      deploymentMode: deps.deploymentMode,
      ...(deps.communityOrganizationId
        ? { communityOrganizationId: deps.communityOrganizationId }
        : {}),
      getOrganization: deps.getOrganization,
      jobId: helpers.job.id,
    });
    const row = await deps.repository.get(ctx, envelope.payload.outboxId);
    if (!row || row.organizationId !== ctx.organizationId)
      throw new Error('Mail outbox unavailable');
    const variables = { ...row.variables };
    if (row.templateKey === 'verification') {
      const url = new URL(
        variables.verificationUrl ?? '/',
        deps.canonicalBaseUrl,
      );
      const base = new URL(deps.canonicalBaseUrl);
      if (url.origin !== base.origin)
        throw new Error(
          'Verification URL must use the configured canonical origin',
        );
      variables.verificationUrl = url.href;
    }
    await processMailOutboxJob({
      ctx,
      outboxId: row.id,
      deps: {
        repository: {
          ...deps.repository,
          get: async () => ({ ...row, variables }),
        },
        mail: deps.mail,
      },
    });
  };
}
