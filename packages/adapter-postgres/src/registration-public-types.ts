import type { Database } from './database.js';

export interface PublicRegistrationDependencies {
  db: Database;
  options: { canonicalBaseUrl: string; tokenTtlMs?: number };
  canonicalBase: URL;
  hashToken: (token: string) => string;
}
