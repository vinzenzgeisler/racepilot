export type LogFields = Readonly<Record<string, unknown>>;

/**
 * Port: structured logging. Messages are constant summaries; variable data goes
 * into `fields` and must never contain secrets, tokens, or personal data.
 */
export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/** Community default: one console line per event with the fields as an object. */
export const consoleLogger: Logger = {
  info: (message, fields) =>
    fields ? console.info(message, fields) : console.info(message),
  warn: (message, fields) =>
    fields ? console.warn(message, fields) : console.warn(message),
  error: (message, fields) =>
    fields ? console.error(message, fields) : console.error(message),
};

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
