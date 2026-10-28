import { z } from 'zod';

export const mailConfigSchema = z.object({
  MAIL_PROVIDER: z.enum(['disabled', 'smtp']).default('disabled'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_REPLY_TO: z.string().optional(),
  CANONICAL_BASE_URL: z.string().optional(),
});

export function validateMailConfig(env: Record<string, string | undefined>) {
  const parsed = mailConfigSchema.safeParse(env);
  if (!parsed.success) {
    const names = [
      ...new Set(
        parsed.error.issues.map((issue) =>
          String(issue.path[0] ?? 'configuration'),
        ),
      ),
    ];
    throw new Error(`Invalid configuration variables: ${names.join(', ')}`);
  }
  const config = parsed.data;
  if (
    config.MAIL_PROVIDER === 'smtp' &&
    (!config.SMTP_HOST ||
      !config.SMTP_PORT ||
      !config.SMTP_FROM ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.SMTP_FROM) ||
      (config.SMTP_REPLY_TO !== undefined &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.SMTP_REPLY_TO)) ||
      Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD))
  ) {
    throw new Error(
      'Invalid configuration variables: SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_REPLY_TO, SMTP_USER, SMTP_PASSWORD',
    );
  }
  if (config.CANONICAL_BASE_URL) {
    try {
      const url = new URL(config.CANONICAL_BASE_URL);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
      if (
        url.protocol !== 'https:' &&
        !['localhost', '127.0.0.1'].includes(url.hostname)
      )
        throw new Error();
    } catch {
      throw new Error('Invalid configuration variables: CANONICAL_BASE_URL');
    }
  }
  return config;
}
