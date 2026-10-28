import type { MailMessage, MailProvider } from '@racepilot/core';

/** In-memory SMTP-port substitute for deterministic service and CI tests. */
export function createRecordingMailProvider(
  options: {
    fail?: (message: MailMessage, attempt: number) => Error | null;
  } = {},
) {
  const messages: MailMessage[] = [];
  let attempts = 0;
  const provider: MailProvider = {
    async send(message) {
      attempts += 1;
      const failure = options.fail?.(message, attempts);
      if (failure) throw failure;
      messages.push(structuredClone(message));
    },
  };
  return {
    provider,
    messages,
    get attempts() {
      return attempts;
    },
  };
}
