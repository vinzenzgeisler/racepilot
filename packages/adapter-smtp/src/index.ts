import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { MailMessage, MailProvider } from '@racepilot/core';
import { ProviderError } from '@racepilot/core';
export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user?: string;
  readonly password?: string;
  readonly from: string;
}
export function createSmtpMailProvider(config: SmtpConfig): MailProvider {
  if (
    !config.host.trim() ||
    !config.from.trim() ||
    config.port < 1 ||
    config.port > 65535
  )
    throw new ProviderError('not_configured', 'SMTP configuration is invalid');
  const auth =
    config.user || config.password
      ? { user: config.user ?? '', pass: config.password ?? '' }
      : undefined;
  if (auth && (!auth.user || !auth.pass))
    throw new ProviderError(
      'not_configured',
      'SMTP authentication configuration is incomplete',
    );
  const transport: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 30_000,
    greetingTimeout: 30_000,
    socketTimeout: 30_000,
    ...(auth ? { auth } : {}),
  });
  return {
    send: (message: MailMessage) => send(transport, config.from, message),
  };
}
async function send(
  transport: Transporter,
  from: string,
  message: MailMessage,
): Promise<void> {
  try {
    await transport.sendMail({
      from: message.from ?? from,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
  } catch (cause) {
    throw new ProviderError('unavailable', 'Mail delivery failed', { cause });
  }
}
